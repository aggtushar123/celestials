import { describe, expect, it } from 'vitest';
import { ACCOUNT_FILTER_OPTIONS } from '../../features/accounts/testPortfolio';
import { FILTER_OPTIONS } from '../../features/organizations/testPortfolio';
import { OPPORTUNITIES_KIND } from '../../features/pipelines/pipelineKinds';
import { OPPORTUNITY_ROWS, pipelineFilterOptions } from '../../features/pipelines/testPipelines';
import type { DashboardContext, OrganizationDetailContext, OrganizationsContext } from '../../pages/copilot/types';
import { originTag, surfaceLabel } from './surfaceLabels';

const DASH: DashboardContext = { surface: 'dashboard', area: 'revenue', view: 'forecast', filters: { owner: '2', lifecycle: '', customer: '' }, focus: null };
const ORG: OrganizationsContext = { surface: 'organizations', view: 'list', filters: { owner: '2' }, focus: null };
const PAGE: OrganizationDetailContext = { surface: 'organizations', view: 'detail', organization: 7, account: 31, focus: null };

describe('surface labels', () => {
  it("names a question on either surface with that surface's names", () => {
    expect(surfaceLabel(DASH, { dashboard: { owner: { '2': 'Priya' } } })).toBe('Revenue › Forecast · Owner: Priya');
    expect(surfaceLabel(DASH)).toBe('Revenue › Forecast · Owner: 2');
    expect(surfaceLabel(ORG, { organizations: FILTER_OPTIONS })).toBe('Organizations · Owner: Carl CSM');
    expect(surfaceLabel({ ...ORG, focus: { kind: 'companies', ids: [7] } })).toBe('Organizations · Owner: User 2 · 1 account');
  });

  it('tags a conversation with where it started', () => {
    expect(originTag({ origin: { surface: 'dashboard', area: 'health', view: 'triage', filters: DASH.filters } })).toBe('Health › Triage');
    expect(
      originTag({ origin: { surface: 'organizations', view: 'list', filters: { owner: '2' }, labels: ['Owner: Carl CSM'] } }),
    ).toBe('Organizations · Owner: Carl CSM');
    expect(originTag({ origin: { surface: 'organizations', view: 'board', filters: {}, labels: [] } })).toBe('Organizations');
    expect(originTag({ origin: null })).toBeNull();
  });

  it("names an organisation page's question from the page, or from the server's label once stored", () => {
    const detail = { organization: 7, name: 'Pizza Hut', accounts: { 31: 'EMEA' } };
    expect(surfaceLabel(PAGE, { detail })).toBe('Pizza Hut · EMEA');
    expect(surfaceLabel({ ...PAGE, focus: { kind: 'call', id: 12 } }, { detail })).toBe('Pizza Hut · EMEA · This call');
    expect(surfaceLabel({ ...PAGE, label: 'Pizza Hut · EMEA' })).toBe('Pizza Hut · EMEA');
  });

  it("tags a conversation started on an organisation's page with the server's label", () => {
    const origin = { surface: 'organizations' as const, view: 'detail' as const, organization: 7, account: null, label: 'Pizza Hut' };
    expect(originTag({ origin })).toBe('Pizza Hut');
    expect(originTag({ origin: { ...origin, account: 31, label: 'Pizza Hut · EMEA' } })).toBe('Pizza Hut · EMEA');
  });

  it('labels a Contacts question and tags a Contacts conversation with the server label', () => {
    const names = { person: { id: 41, name: 'Lukas Vermeer', place: 'Kraft Heinz' }, organisation: null, account: null };
    expect(surfaceLabel({ surface: 'contacts', view: 'person', contact: 41, focus: 'sentiment' }, { contacts: names })).toBe(
      'Lukas Vermeer · Kraft Heinz · Sentiment',
    );
    expect(surfaceLabel({ surface: 'contacts', view: 'list', filters: { sentiment: 'negative' } })).toBe('Contacts · Negative');
    expect(originTag({ origin: { surface: 'contacts', view: 'person', contact: 41, label: 'Lukas Vermeer · Kraft Heinz' } })).toBe(
      'Lukas Vermeer · Kraft Heinz',
    );
    expect(originTag({ origin: { surface: 'contacts', view: 'list', filters: {}, label: 'Contacts' } })).toBe('Contacts');
  });

  it('labels an Accounts question from the page, and tags an Accounts conversation with the server label', () => {
    const accounts = { options: ACCOUNT_FILTER_OPTIONS, account: { id: 12, name: 'Pizza EMEA' } };
    expect(surfaceLabel({ surface: 'accounts', view: 'board', filters: { owner: '2' } }, { accounts })).toBe('Accounts · Owner: Carl CSM');
    expect(surfaceLabel({ surface: 'accounts', view: 'detail', account: 12, focus: { kind: 'call', id: 112 } }, { accounts })).toBe(
      'Pizza EMEA · This call',
    );
    expect(surfaceLabel({ surface: 'accounts', view: 'detail', account: 12, focus: null, label: 'EMEA' })).toBe('EMEA');
    expect(
      originTag({ origin: { surface: 'accounts', view: 'board', filters: { renews_within: '30' }, label: 'Accounts · Renews within 30 days' } }),
    ).toBe('Accounts · Renews within 30 days');
    expect(originTag({ origin: { surface: 'accounts', view: 'detail', account: 12, label: 'EMEA' } })).toBe('EMEA');
  });

  it('labels a Pipelines question from the page, and tags a Pipelines conversation with the server label', () => {
    const pipelines = { kind: 'opportunities', options: pipelineFilterOptions(OPPORTUNITY_ROWS, OPPORTUNITIES_KIND) } as const;
    expect(surfaceLabel({ surface: 'pipelines', kind: 'opportunities', view: 'board', filters: { owner: '2' } }, { pipelines })).toBe(
      'Pipelines · Opportunities · Owner: Carl CSM',
    );
    expect(
      surfaceLabel({ surface: 'pipelines', kind: 'risks', view: 'list', filters: {}, focus: { kind: 'risk', id: 71 }, label: 'Pipelines · Risks' }),
    ).toBe('Pipelines · Risks · This risk');
    expect(
      originTag({ origin: { surface: 'pipelines', kind: 'risks', view: 'board', filters: { priority: 'high' }, label: 'Pipelines · Risks · Priority: High' } }),
    ).toBe('Pipelines · Risks · Priority: High');
  });

  it('names a Brain question, and tags a Brain conversation, with the tab and the scope', () => {
    const brain = { surface: 'brain', scope: 'company', tab: 'changed' } as const;
    expect(surfaceLabel(brain)).toBe('Brain · What changed · Company');
    expect(originTag({ origin: { surface: 'brain', scope: 'team', tab: 'doing' } })).toBe("Brain · What's being done · My team");
  });
});

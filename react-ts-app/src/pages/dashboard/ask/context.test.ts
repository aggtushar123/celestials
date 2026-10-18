import { describe, expect, it } from 'vitest';
import type { DashboardContext, OrganizationDetailContext, OrganizationsContext } from '../../copilot/types';
import { withFocus } from './context';

const DASH: DashboardContext = { surface: 'dashboard', area: 'health', view: 'triage', filters: { owner: '', lifecycle: '', customer: '' }, focus: null };
const LIST: OrganizationsContext = { surface: 'organizations', view: 'list', filters: {}, focus: null };
const PAGE: OrganizationDetailContext = { surface: 'organizations', view: 'detail', organization: 7, account: null, focus: null };

describe('withFocus', () => {
  it('gives each screen only its own kind of focus', () => {
    const companies = { kind: 'companies' as const, ids: [7] };
    const attention = { kind: 'attention' as const, key: 'renewal' };
    const note = { kind: 'note' as const, id: 4 };
    expect(withFocus(DASH, companies)).toEqual({ ...DASH, focus: companies });
    expect(withFocus(DASH, attention)).toEqual({ ...DASH, focus: attention });
    expect(withFocus(DASH, note)).toEqual(DASH);
    expect(withFocus(LIST, companies)).toEqual({ ...LIST, focus: companies });
    expect(withFocus(LIST, note)).toEqual(LIST);
    expect(withFocus(PAGE, note)).toEqual({ ...PAGE, focus: note });
    expect(withFocus(PAGE, companies)).toEqual(PAGE);
    expect(withFocus(PAGE, null)).toEqual(PAGE);
  });

  it('turns the sentiment focus into the person context, and ignores it everywhere else', () => {
    const person = { surface: 'contacts', view: 'person', contact: 41, focus: null } as const;
    const list = { surface: 'contacts', view: 'list', filters: {} } as const;
    expect(withFocus(person, { kind: 'sentiment' })).toEqual({ ...person, focus: 'sentiment' });
    expect(withFocus(person, { kind: 'companies', ids: [1] })).toEqual(person);
    expect(withFocus(list, { kind: 'sentiment' })).toEqual(list);
    expect(withFocus(DASH, { kind: 'sentiment' })).toMatchObject({ focus: null });
  });

  it("gives an account's page only a story focus, and the Accounts List and Board none", () => {
    const page = { surface: 'accounts', view: 'detail', account: 12, focus: null } as const;
    const list = { surface: 'accounts', view: 'list', filters: { owner: '2' } } as const;
    expect(withFocus(page, { kind: 'email', id: 141 })).toEqual({ ...page, focus: { kind: 'email', id: 141 } });
    expect(withFocus(page, { kind: 'companies', ids: [12] })).toEqual(page);
    expect(withFocus(page, { kind: 'sentiment' })).toEqual(page);
    // The server drops a focus on these views: the client never sends one.
    expect(withFocus(list, { kind: 'companies', ids: [12] })).toEqual(list);
    expect(withFocus(list, { kind: 'email', id: 141 })).not.toHaveProperty('focus');
  });

  it('gives a Pipelines question only an item of its own kind as a focus, and no focus key without one', () => {
    const risks = { surface: 'pipelines', kind: 'risks', view: 'list', filters: { owner: '2' } } as const;
    expect(withFocus(risks, { kind: 'risk', id: 71 })).toEqual({ ...risks, focus: { kind: 'risk', id: 71 } });
    expect(withFocus(risks, { kind: 'opportunity', id: 41 })).toStrictEqual(risks);
    expect(withFocus(risks, { kind: 'companies', ids: [7] })).toStrictEqual(risks);
    expect(withFocus(risks, { kind: 'email', id: 141 })).toStrictEqual(risks);
    expect(withFocus(risks, null)).not.toHaveProperty('focus');
  });

  it('passes a Brain context through unchanged: there is no focus on the Brain yet', () => {
    const brain = { surface: 'brain', scope: 'team', tab: 'changed' } as const;
    expect(withFocus(brain, { kind: 'companies', ids: [7] })).toBe(brain);
    expect(withFocus(brain, null)).toBe(brain);
  });
});

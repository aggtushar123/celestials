import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCallback, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OUTSIDE_BUNDLES } from '../../features/agents/testBundleFixtures';
import { stubBundles } from '../../features/agents/testBundles';
import { PickSelect } from './PickSelect';
import { PickSearch } from './PickSearch';
import { usePickList } from './usePickList';
import type { PickValue } from '../../features/agents/bundleTypes';

// Agent bundles D3 contract §5.2; frontend Decision 3. Only fetch is stubbed.
afterEach(() => vi.unstubAllGlobals());

function Projects({ onChange = () => {} }: { onChange?: (v: PickValue | null) => void }) {
  const { state, retry } = usePickList({ bundleId: 401, stepId: 413, list: 'jira_projects', enabled: true });
  return <PickSelect id="p" label="Project" list="jira_projects" state={state} retry={retry} value={{ id: 'SUP', name: 'SUP' }} onChange={onChange} />;
}

function Priorities({ value, onChange = () => {}, none }: { value: PickValue | null; onChange?: (v: PickValue | null) => void; none?: string }) {
  const { state, retry } = usePickList({ bundleId: 401, stepId: 413, list: 'jira_priorities', enabled: true });
  return <PickSelect id="pr" label="Priority" list="jira_priorities" state={state} retry={retry} value={value} onChange={onChange} none={none} />;
}

const texts = (select: HTMLElement) => Array.from((select as HTMLSelectElement).options).map((o) => o.textContent);
const selectedText = (select: HTMLElement) => (select as HTMLSelectElement).selectedOptions[0]?.textContent;

function People({ value, onChange, none }: { value: PickValue | null; onChange: (v: PickValue | null) => void; none?: string }) {
  const [query, setQuery] = useState('');
  const onQuery = useCallback((q: string) => setQuery(q), []);
  const { state, retry } = usePickList({ bundleId: 401, stepId: 413, list: 'jira_assignees', project: 'SUP', query, enabled: true });
  return <PickSearch id="a" label="Assignee" list="jira_assignees" state={state} retry={retry} onQuery={onQuery} value={value} onChange={onChange} none={none} />;
}

describe('usePickList and PickSelect', () => {
  it('shows the stored value, loads, then lists', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    render(<Projects />);
    expect(screen.getByText('Loading Jira projects…')).toBeInTheDocument();
    const select = await screen.findByRole('combobox', { name: 'Project' });
    await waitFor(() => expect(screen.queryByText('Loading Jira projects…')).toBeNull());
    expect(texts(select)).toEqual(['Support (SUP)', 'Engineering (ENG)']);
    expect((select as HTMLSelectElement).value).toBe('SUP');
  });

  it("shows the server's sentence and tries again", async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES, failOptions: { jira_projects: { status: 502, body: { code: 'TOOL_UNREACHABLE', detail: "Couldn't reach Jira. Try again." } } } });
    render(<Projects />);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach Jira. Try again.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('combobox', { name: 'Project' })).toBeInTheDocument();
  });

  it('falls back to its own sentence without a detail', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES, failOptions: { jira_projects: { status: 500, body: {} } } });
    render(<Projects />);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load Jira projects.");
  });

  it('searches people after a pause, and offers Unassigned', async () => {
    const { spy } = stubBundles({ bundles: OUTSIDE_BUNDLES });
    const picked: (PickValue | null)[] = [];
    render(<People value={null} onChange={(v) => picked.push(v)} none="Unassigned" />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search people in Jira' }), 'pri');
    const select = await screen.findByRole('combobox', { name: 'Assignee' });
    await waitFor(() => expect(texts(select)).toEqual(['Unassigned', 'Priya Shah (priya@acme.io)']));
    await userEvent.selectOptions(select, 'acc-priya');
    expect(picked.at(-1)).toEqual({ id: 'acc-priya', name: 'Priya Shah' });
    const asked = spy.mock.calls.map(([input]) => String(input)).filter((u) => u.includes('jira_assignees'));
    expect(asked.at(-1)).toContain('query=pri');
    expect(asked.some((u) => u.includes('query=p&') || u.endsWith('query=p'))).toBe(false);
  });
});

// Controller ruling R1: a name-only value (id '') is the model's pick, resolved by name when it runs.
describe('PickSelect with a name-only value', () => {
  it('shows its name selected before the list loads, never the none choice', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    render(<Priorities value={{ id: '', name: 'High' }} none="Jira's default" />);
    const select = screen.getByRole('combobox', { name: 'Priority' });
    expect(selectedText(select)).toBe('High');
    expect(selectedText(select)).not.toBe("Jira's default");
    await waitFor(() => expect(screen.queryByText('Loading Jira priorities…')).toBeNull());
  });

  it('selects the matching loaded option, case-insensitively, without calling onChange', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const onChange = vi.fn();
    render(<Priorities value={{ id: '', name: 'high' }} none="Jira's default" onChange={onChange} />);
    await waitFor(() => expect(texts(screen.getByRole('combobox', { name: 'Priority' }))).toContain('High'));
    const select = screen.getByRole('combobox', { name: 'Priority' });
    expect((select as HTMLSelectElement).value).toBe('2');
    expect(selectedText(select)).toBe('High');
    expect(texts(select).filter((t) => t === 'High')).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('draws a name that matches nothing as its own option, and choosing it again keeps the stored value', async () => {
    stubBundles({ bundles: OUTSIDE_BUNDLES });
    const onChange = vi.fn();
    const stored = { id: '', name: 'Urgent' };
    render(<Priorities value={stored} none="Jira's default" onChange={onChange} />);
    await waitFor(() => expect(texts(screen.getByRole('combobox', { name: 'Priority' }))).toContain('High'));
    const select = screen.getByRole('combobox', { name: 'Priority' });
    expect(selectedText(select)).toBe('Urgent');
    await userEvent.selectOptions(select, '2');
    expect(onChange).toHaveBeenLastCalledWith({ id: '2', name: 'High' });
    await userEvent.selectOptions(select, 'name:Urgent');
    expect(onChange).toHaveBeenLastCalledWith(stored);
  });
});

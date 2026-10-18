import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ACCOUNT_PAGE_TABS, type AccountTab } from '../../../features/accounts/accountPageParams';
import { ACCOUNT_ATTENTION, ACCOUNT_LISTS, accountStoryQueries, stubAccountPage } from '../../../features/accounts/testAccountPage';
import { storyFilters, type StoryParams } from '../../../features/organizations/detailParams';
import type { DetailScope } from '../../../features/organizations/detailScope';
import type { PanelKey } from '../../../features/organizations/portfolioFields';
import { storyQuery } from '../../../features/organizations/storyApi';
import { postBodies, requestPaths } from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { Tabs } from '../../ui';
import { AddFlow } from '../../organizations/detail/AddFlow';
import { AttentionBlock } from '../../organizations/detail/AttentionBlock';
import { StoryTab } from '../../organizations/detail/StoryTab';
import { ShowAccountTags } from '../../organizations/detail/accountNames';
import { useStory } from '../../organizations/detail/useStory';

// The organisation page's Story parts on one account (spec 2026-09-29 §2.5):
// the account story, no account tags, + Add on the account, renewal to the
// Commercial panel.

const EMEA: DetailScope = { kind: 'account', id: 12, name: 'Pizza EMEA' };
const itemKeys = () => [...document.querySelectorAll('[data-story-item]')].map((el) => el.getAttribute('data-story-item'));

function TabsHarness() {
  const [active, setActive] = useState<AccountTab>('story');
  return (
    <Tabs
      label="Account sections"
      idBase="t"
      value={active}
      onChange={setActive}
      items={ACCOUNT_PAGE_TABS.map((tab) => ({ key: tab.key, label: tab.label }))}
    />
  );
}

function StoryHarness({ onJump }: { onJump: (panel: PanelKey) => void }) {
  const [params, setParams] = useState<StoryParams>({ account: '', group: '', sources: [], q: '' });
  const [version, setVersion] = useState(0);
  const story = useStory(EMEA, storyQuery(storyFilters(params)), version, true);
  return (
    <ShowAccountTags.Provider value={false}>
      <StoryTab
        scope={EMEA}
        story={story}
        params={params}
        accounts={[]}
        isSm
        active
        onUpdate={(patch) => setParams((prev) => ({ ...prev, ...patch }))}
        onAdded={() => setVersion((v) => v + 1)}
        onJump={onJump}
      />
    </ShowAccountTags.Provider>
  );
}

function renderStory() {
  const onJump = vi.fn();
  render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <StoryHarness onJump={onJump} />
      </MemoryRouter>
    </Provider>,
  );
  return onJump;
}

describe('the Story parts on one account', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.style.overflow = '';
  });

  it('the account page\'s tabs are its seven sections, named Account sections', async () => {
    render(<TabsHarness />);
    const list = screen.getByRole('tablist', { name: 'Account sections' });
    expect(within(list).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(ACCOUNT_PAGE_TABS.map((tab) => tab.label));
    screen.getByRole('tab', { name: 'Story' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    const objects = screen.getByRole('tab', { name: 'Custom objects' });
    expect(objects).toHaveAttribute('aria-selected', 'true');
    expect(objects).toHaveFocus();
    expect(objects).toHaveAttribute('aria-controls', 't-panel-objects');
  });

  it('Needs attention sends the renewal to the Commercial panel and has no Knowledge row', async () => {
    const onJump = vi.fn();
    const onFilter = vi.fn();
    render(<AttentionBlock attention={ACCOUNT_ATTENTION} onFilter={onFilter} onJump={onJump} renewalPanel="commercial" />);
    const block = screen.getByRole('region', { name: 'Needs attention' });
    expect(within(block).getAllByRole('listitem')).toHaveLength(3);
    expect(block).not.toHaveTextContent(/question/);
    await userEvent.click(within(block).getByRole('button', { name: /^Renewal 47d overdue/ }));
    expect(onJump).toHaveBeenCalledWith('commercial');
    await userEvent.click(within(block).getByRole('button', { name: /^1 overdue task/ }));
    expect(onFilter).toHaveBeenCalledWith('tasks');
  });

  it('reads the account story, with no account tag on any item', async () => {
    const spy = stubAccountPage();
    renderStory();
    await waitFor(() => expect(itemKeys()).toEqual(['email:141', 'call:112', 'ticket:188', 'task:105', 'health:103']));
    for (const item of document.querySelectorAll('[data-story-item]')) expect(item).not.toHaveTextContent('Pizza EMEA');
    expect(screen.getByRole('region', { name: 'Needs attention' })).toBeInTheDocument();
    expect(accountStoryQueries(spy)[0].toString()).toBe('limit=30');
  });

  it('sends the renewal row to Commercial', async () => {
    stubAccountPage();
    const onJump = renderStory();
    await userEvent.click(await screen.findByRole('button', { name: /^Renewal 47d overdue/ }));
    expect(onJump).toHaveBeenCalledWith('commercial');
  });

  it('+ Add saves a task on the account, and the story reads it again', async () => {
    const spy = stubAccountPage();
    renderStory();
    await waitFor(() => expect(itemKeys()).toHaveLength(5));
    await userEvent.click(screen.getByRole('button', { name: 'Add to the story' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'New task' }));
    const dialog = screen.getByRole('dialog', { name: 'New task' });
    expect(dialog).toHaveAccessibleDescription('On Pizza EMEA');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Task title' }), 'Book the retraining');
    fireEvent.change(within(dialog).getByLabelText('Due date'), { target: { value: '2026-10-01' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(itemKeys()).toContain('task:901'));
    expect(postBodies(spy, '/accounts/12/tasks/')).toEqual([
      { title: 'Book the retraining', due_date: '2026-10-01', priority: 'medium', assignee_id: null },
    ]);
  });

  it('Feedback links to the Logged scores tab, unfiltered', async () => {
    stubAccountPage();
    renderStory();
    await waitFor(() => expect(itemKeys()).toHaveLength(5));
    await userEvent.click(screen.getByRole('button', { name: /^Feedback/ }));
    expect(screen.getByRole('link', { name: 'Manage surveys' })).toHaveAttribute('href', '/surveys?tab=logged');
  });

  it('opens an email\'s thread from the account story', async () => {
    const spy = stubAccountPage();
    renderStory();
    await userEvent.click(await screen.findByRole('button', { name: 'Re: EMEA renewal' }));
    const sheet = screen.getByRole('dialog', { name: 'Re: EMEA renewal' });
    expect(await within(sheet).findByText('Sharing the quote ahead of your board meeting.')).toBeInTheDocument();
    expect(sheet).not.toHaveTextContent('Pizza EMEA');
    expect(accountStoryQueries(spy).some((query) => query.get('thread') === 't-9')).toBe(true);
  });

  it('+ Add logs a call on the account alone, offering its people', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    const onAdded = vi.fn();
    render(
      <Provider store={makeDetailStore()}>
        <MemoryRouter>
          <AddFlow what="call" accountId={12} accountName="Pizza EMEA" isSm onAdded={onAdded} onClose={vi.fn()} />
        </MemoryRouter>
      </Provider>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Log a call' });
    expect(dialog).toHaveAccessibleDescription('On Pizza EMEA');
    await waitFor(() => expect(requestPaths(spy)).toContain('GET /accounts/12/contacts/'));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Call title' }), 'Renewal check-in');
    fireEvent.change(within(dialog).getByLabelText('When'), { target: { value: '2026-09-25T10:00' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Log call' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
    expect(postBodies(spy, '/accounts/12/calls/')[0]).toMatchObject({ title: 'Renewal check-in' });
  });

  it('+ Add logs a survey on the account, with no CES', async () => {
    const spy = stubAccountPage();
    const onAdded = vi.fn();
    render(
      <Provider store={makeDetailStore()}>
        <MemoryRouter>
          <AddFlow what="survey" accountId={12} accountName="Pizza EMEA" isSm onAdded={onAdded} onClose={vi.fn()} />
        </MemoryRouter>
      </Provider>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Log survey' });
    expect(within(dialog).queryByRole('option', { name: 'CES' })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Log' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
    expect(postBodies(spy, '/accounts/12/surveys/')[0]).toMatchObject({ survey_type: 'nps' });
  });
});

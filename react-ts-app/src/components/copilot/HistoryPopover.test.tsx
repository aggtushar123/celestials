import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { HistoryPopover } from './CopilotRail';
import { stubCopilot } from './testCopilot';

const origin = { surface: 'dashboard', area: 'revenue', view: 'forecast', filters: { owner: '2', lifecycle: '', customer: '' } };

describe('HistoryPopover', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('tags each dashboard conversation with where it started, and nothing else', async () => {
    stubCopilot({
      conversations: [
        { id: 1, title: 'Why is at-risk ARR up?', created_at: '', updated_at: '', origin },
        { id: 2, title: 'What is going on with Pizza Hut?', created_at: '', updated_at: '', origin: null },
      ],
    });
    render(<HistoryPopover onClose={() => {}} onOpen={() => {}} />);
    const tagged = await screen.findByRole('button', { name: /Why is at-risk ARR up\?/ });
    expect(within(tagged).getByText('Revenue › Forecast')).toBeInTheDocument();
    expect(tagged).toHaveAccessibleName(/Why is at-risk ARR up\?\s*Started on the dashboard: Revenue › Forecast/);
    expect(screen.getByRole('button', { name: 'What is going on with Pizza Hut?' })).toBeInTheDocument();
  });

  it("tags an Organizations conversation with the server's labels", async () => {
    stubCopilot({
      conversations: [
        {
          id: 3,
          title: 'Who renews first?',
          created_at: '',
          updated_at: '',
          origin: { surface: 'organizations', view: 'list', filters: { owner: '2' }, labels: ['Owner: Carl CSM'] },
        },
      ],
    });
    render(<HistoryPopover onClose={() => {}} onOpen={() => {}} />);
    const tagged = await screen.findByRole('button', { name: /Who renews first\?/ });
    expect(within(tagged).getByText('Organizations · Owner: Carl CSM')).toBeInTheDocument();
    expect(tagged).toHaveAccessibleName(/Who renews first\?\s*Started on Organizations · Owner: Carl CSM/);
  });

  it("tags a conversation started on Contacts with the server's label", async () => {
    stubCopilot({
      conversations: [
        {
          id: 5,
          title: "Why is Lukas's sentiment negative?",
          created_at: '',
          updated_at: '',
          origin: { surface: 'contacts', view: 'person', contact: 41, label: 'Lukas Vermeer · Kraft Heinz' },
        },
      ],
    });
    render(<HistoryPopover onClose={() => {}} onOpen={() => {}} />);
    const tagged = await screen.findByRole('button', { name: /Why is Lukas's sentiment negative\?/ });
    expect(within(tagged).getByText('Lukas Vermeer · Kraft Heinz')).toBeInTheDocument();
    expect(tagged).toHaveAccessibleName(/Why is Lukas's sentiment negative\?\s*Started on Lukas Vermeer · Kraft Heinz/);
  });

  it('lets the title win over its origin tag, and keeps the full tag text available', async () => {
    stubCopilot({
      conversations: [
        {
          id: 4,
          title: 'Which of these accounts should I prioritise this week?',
          created_at: '',
          updated_at: '',
          origin: { surface: 'organizations', view: 'list', filters: { owner: '2' }, labels: ['Owner: Carl CSM'] },
        },
      ],
    });
    render(<HistoryPopover onClose={() => {}} onOpen={() => {}} />);
    const tagged = await screen.findByRole('button', { name: /Which of these accounts/ });
    const title = within(tagged).getByText('Which of these accounts should I prioritise this week?');
    expect(title).toHaveClass('flex-1', 'min-w-0', 'truncate');
    const tagText = within(tagged).getByText('Organizations · Owner: Carl CSM');
    const tag = tagText.parentElement as HTMLElement;
    expect(tag).toHaveClass('max-w-[40%]', 'shrink');
    expect(tag).not.toHaveClass('max-w-[60%]', 'shrink-0');
    expect(tag).toHaveAttribute('title', 'Organizations · Owner: Carl CSM');
  });

  it("tags a conversation started on Accounts with the server's label and the Accounts icon", async () => {
    stubCopilot({
      conversations: [
        {
          id: 14,
          title: 'What renews soon?',
          created_at: '',
          updated_at: '',
          origin: { surface: 'accounts', view: 'board', filters: { renews_within: '30' }, label: 'Accounts · Renews within 30 days' },
        },
      ],
    });
    render(<HistoryPopover onClose={() => {}} onOpen={() => {}} />);
    const tagged = await screen.findByRole('button', { name: /What renews soon\?/ });
    expect(within(tagged).getByText('Accounts · Renews within 30 days')).toBeInTheDocument();
    expect(tagged).toHaveAccessibleName(/What renews soon\?\s*Started on Accounts · Renews within 30 days/);
    expect(tagged.querySelector('svg.lucide-layers')).not.toBeNull();
  });

  it("tags a conversation started on Pipelines with the server's label and the Pipelines icon", async () => {
    stubCopilot({
      conversations: [
        {
          id: 16,
          title: 'What should I chase?',
          created_at: '',
          updated_at: '',
          origin: { surface: 'pipelines', kind: 'opportunities', view: 'list', filters: {}, label: 'Pipelines · Opportunities' },
        },
      ],
    });
    render(<HistoryPopover onClose={() => {}} onOpen={() => {}} />);
    const tagged = await screen.findByRole('button', { name: /What should I chase\?/ });
    expect(within(tagged).getByText('Pipelines · Opportunities')).toBeInTheDocument();
    expect(tagged).toHaveAccessibleName(/What should I chase\?\s*Started on Pipelines · Opportunities/);
    expect(tagged.querySelector('svg.lucide-target')).not.toBeNull();
  });

  it('tags a conversation started on the Brain with its tab and scope, and the Brain icon', async () => {
    stubCopilot({
      conversations: [
        { id: 21, title: 'Why did these numbers move?', created_at: '', updated_at: '', origin: { surface: 'brain', scope: 'team', tab: 'changed' } },
      ],
    });
    render(<HistoryPopover onClose={() => {}} onOpen={() => {}} />);
    const tagged = await screen.findByRole('button', { name: /Why did these numbers move\?/ });
    expect(within(tagged).getByText('Brain · What changed · My team')).toBeInTheDocument();
    expect(tagged).toHaveAccessibleName(/Why did these numbers move\?\s*Started on Brain · What changed · My team/);
    expect(tagged.querySelector('svg.lucide-brain')).not.toBeNull();
  });
});

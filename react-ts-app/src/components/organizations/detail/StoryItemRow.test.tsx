import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SLACK_ITEM } from '../../../features/organizations/testSlack';
import { STORY_ITEMS } from '../../../features/organizations/testStory';
import { AskDraftContext } from '../../../pages/dashboard/ask/context';
import { ShowAccountTags } from './accountNames';
import { StoryItemRow } from './StoryItemRow';

const call = STORY_ITEMS.find((item) => item.kind === 'call')!;

function renderRow(draft: ((question: string, focus: unknown) => void) | null) {
  return render(
    <AskDraftContext.Provider value={draft}>
      <ul>
        <StoryItemRow item={call} onOpenEmail={() => {}} onOpenSlack={() => {}} />
      </ul>
    </AskDraftContext.Provider>,
  );
}

describe('StoryItemRow: Ask about this', () => {
  it('prefills a question about this one item, focused on it', async () => {
    const draft = vi.fn();
    renderRow(draft);
    await userEvent.click(screen.getByRole('button', { name: 'Ask about this: Quarterly check-in' }));
    expect(draft).toHaveBeenCalledWith('What should I know about this call?', { kind: 'call', id: 12 });
  });

  it('is a 44px target on phones and a 36px one from sm (house rule §4.5)', () => {
    renderRow(vi.fn());
    const button = screen.getByRole('button', { name: /^Ask about this/ });
    expect(button).toHaveClass('min-h-11', 'sm:min-h-9');
    expect(button).not.toHaveClass('sm:min-h-0');
    expect(button).toHaveTextContent('Ask about this');
  });

  it('is not offered outside an Ask provider', () => {
    renderRow(null);
    expect(screen.queryByRole('button', { name: /^Ask about this/ })).not.toBeInTheDocument();
  });
});

describe('StoryItemRow: a plan task (plans spec §2.5)', () => {
  const task = STORY_ITEMS.find((item) => item.kind === 'task')!;

  it('links "<Plan> · <Milestone>" under the title', () => {
    render(
      <MemoryRouter>
        <ul>
          <StoryItemRow item={{ ...task, plan: { id: 41, name: 'Onboarding · Globex' }, milestone: { id: 412, name: 'Set up' } }} onOpenEmail={() => {}} onOpenSlack={() => {}} />
        </ul>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Onboarding · Globex · Set up' })).toHaveAttribute('href', '/projects/41');
  });

  it('shows no plan link for a task outside a plan', () => {
    render(
      <MemoryRouter>
        <ul>
          <StoryItemRow item={{ ...task, plan: null, milestone: null }} onOpenEmail={() => {}} onOpenSlack={() => {}} />
        </ul>
      </MemoryRouter>,
    );
    expect(document.querySelector('[data-part="plan"]')).toBeNull();
  });
});

describe('StoryItemRow: a task opens the task panel (Work spec §1.5)', () => {
  const task = STORY_ITEMS.find((item) => item.kind === 'task')!;

  it('links its title to ?task=<id> on the page it is on, keeping the filters', () => {
    render(
      <MemoryRouter initialEntries={['/organizations/7?group=tasks&source=task']}>
        <ul>
          <StoryItemRow item={{ ...task, plan: null, milestone: null }} onOpenEmail={() => {}} onOpenSlack={() => {}} />
        </ul>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: task.title })).toHaveAttribute('href', `/organizations/7?group=tasks&source=task&task=${task.id}`);
  });
});

describe('StoryItemRow on the primitives (Records PR)', () => {
  const task = STORY_ITEMS.find((item) => item.kind === 'task')!;
  const note = STORY_ITEMS.find((item) => item.kind === 'note') ?? call;
  const tagged = (item: typeof call) =>
    render(
      <MemoryRouter>
        <ShowAccountTags.Provider value={true}>
          <AskDraftContext.Provider value={vi.fn()}>
            <ul>
              <StoryItemRow item={item} onOpenEmail={() => {}} onOpenSlack={() => {}} />
            </ul>
          </AskDraftContext.Provider>
        </ShowAccountTags.Provider>
      </MemoryRouter>,
    );

  it('keeps every row one height: the title control is one line from sm, the time a tabular figure', () => {
    tagged(task);
    const title = screen.getByRole('link', { name: task.title });
    expect(title).toHaveClass('max-sm:leading-[2.75rem]', 'truncate');
    expect(title.className).not.toMatch(/sm:leading-9|sm:min-h-9/);
    expect(document.querySelector('time')).toHaveClass('text-[11px]', 'tabular-nums');
    expect(document.querySelector('time')?.parentElement).toHaveClass('max-sm:items-center', 'max-sm:min-h-11');
  });

  it("tags an account's item with its account, and an organisation's own item with nothing", () => {
    const { unmount } = tagged({ ...note, account: { id: 4, name: 'EMEA' } });
    expect(screen.getByText('EMEA')).toHaveClass('truncate');
    unmount();
    tagged({ ...note, account: null });
    expect(screen.queryByText('Organization')).toBeNull();
  });

  it('puts Ask about this in the row actions, shown on hover or focus from sm', () => {
    tagged(note);
    const ask = screen.getByRole('button', { name: `Ask about this: ${note.title}` });
    expect(ask.parentElement).toHaveClass('sm:opacity-0', 'sm:group-hover:opacity-100', 'sm:group-focus-within:opacity-100', '[@media(hover:none)]:opacity-100');
  });

  it('floats Ask about this over the row corner from sm, so the time sits flush right (static on touch)', () => {
    tagged(note);
    const wrapper = screen.getByRole('button', { name: `Ask about this: ${note.title}` }).parentElement!;
    expect(wrapper).toHaveClass('sm:absolute', 'sm:right-3', 'sm:top-2', 'sm:rounded-lg', 'sm:bg-surface', '[@media(hover:none)]:static');
    expect(wrapper.closest('li')).toHaveClass('relative', 'group');
  });
});

describe('StoryItemRow: a Slack thread (Slack escalations D1 Decision 1)', () => {
  it('opens a Slack thread from its title', async () => {
    const onOpenSlack = vi.fn();
    render(
      <ul>
        <StoryItemRow item={SLACK_ITEM} onOpenEmail={() => {}} onOpenSlack={onOpenSlack} />
      </ul>,
    );
    expect(screen.getByText('Slack thread · Mohd faiz · via Slack')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: SLACK_ITEM.title }));
    expect(onOpenSlack).toHaveBeenCalledWith(SLACK_ITEM);
  });
});

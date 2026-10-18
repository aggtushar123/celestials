import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { DoingInitiative } from '../../features/brain/brainTypes';
import { DO } from '../../features/brain/doingText';
import { bodies, requests, stubBrain } from '../../features/brain/testBrain';
import { CARL_INITIATIVE, COMPANY_INITIATIVE, DANA_INITIATIVE, doingWorld, NO_BASELINE_INITIATIVE, OUTSIDE_VIEW_INITIATIVE } from '../../features/brain/testDoingFixtures';
import { InitiativeRow } from './InitiativeRow';

/** The row with its parent's state, so a saved change re-renders it. */
function Harness({ initial, readerId = 1, onChanged }: { initial: DoingInitiative; readerId?: number; onChanged?: (next: DoingInitiative) => void }) {
  const [one, setOne] = useState(initial);
  return (
    <MemoryRouter>
      <ul>
        <InitiativeRow
          initiative={one}
          readerId={readerId}
          currency="USD"
          onChanged={(next) => {
            onChanged?.(next);
            setOne(next);
          }}
        />
      </ul>
    </MemoryRouter>
  );
}
const row = () => screen.getByRole('listitem');
const button = (name: string) => within(row()).getByRole('button', { name });

describe('InitiativeRow (spec §2.1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the metric, whose book, status, owner, the figures and bar, the days and the work', () => {
    render(<Harness initial={CARL_INITIATIVE} />);
    expect(within(row()).getByRole('heading', { level: 3, name: CARL_INITIATIVE.title })).toBeInTheDocument();
    expect(row().querySelector('[data-part="meta"]')).toHaveTextContent("ARR at risk · Carl CSM's book · Active · Carl CSM");
    expect(row().querySelector('[data-part="figures"]')).toHaveTextContent('$64.1K → $52K → $32K');
    expect(within(row()).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '37.7');
    expect(row().querySelector('[data-part="when"]')).toHaveTextContent('56 days left · by 30 Nov 2026');
    expect(row().querySelector('[data-part="work"]')).toHaveTextContent('Tasks: 1 open · 1 done');
  });

  it('reads "now → target" with no baseline, bar or percentage once a baseline was never captured (final review follow-up)', () => {
    render(<Harness initial={NO_BASELINE_INITIATIVE} />);
    expect(row().querySelector('[data-part="figures"]')?.textContent).toBe('72% → 85%');
    expect(within(row()).queryByRole('progressbar')).toBeNull();
    expect(within(row()).getByText(DO.NOT_MEASURABLE)).toBeInTheDocument();
    // Days left still shows: only the baseline figure is missing.
    expect(row().querySelector('[data-part="when"]')).toHaveTextContent('71 days left');
  });

  it('says "Whole company" and "No owner", and shows no bar when progress is unmeasurable', () => {
    render(<Harness initial={{ ...COMPANY_INITIATIVE, progress: { ...COMPANY_INITIATIVE.progress!, progress_pct: null } }} />);
    expect(row().querySelector('[data-part="meta"]')).toHaveTextContent('Net revenue retention · Whole company · Planned · No owner');
    expect(within(row()).queryByRole('progressbar')).toBeNull();
    expect(within(row()).getByText(DO.NOT_MEASURABLE)).toBeInTheDocument();
  });

  it('expands to the hypothesis and the tasks, each linked to its record', async () => {
    render(<Harness initial={CARL_INITIATIVE} />);
    const details = button(DO.DETAILS);
    expect(details).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(details);
    expect(details).toHaveAttribute('aria-expanded', 'true');
    const panel = row().querySelector('[data-part="details"]') as HTMLElement;
    expect(panel).toBeVisible();
    expect(panel).toHaveTextContent(`Hypothesis: ${CARL_INITIATIVE.hypothesis}`);
    expect(within(panel).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/6');
    expect(within(panel).getByRole('link', { name: 'Uber EMEA' })).toHaveAttribute('href', '/accounts/12');
    expect(panel).toHaveTextContent('Carl CSM · due 20 Oct 2026 · To do');
  });

  it('offers no Details without a hypothesis, outcome or tasks (Contract note 5)', () => {
    const bare: DoingInitiative = { ...CARL_INITIATIVE, hypothesis: undefined, outcome: undefined, work: { open: 1, done: 1 } };
    render(<Harness initial={bare} />);
    expect(within(row()).queryByRole('button', { name: DO.DETAILS })).toBeNull();
  });

  it('says it tracks numbers outside the reader’s view, with no bar, figures or book text, and keeps Edit/Mark done (controller item c; I2, final review)', () => {
    render(<Harness initial={OUTSIDE_VIEW_INITIATIVE} />);
    // No "Whole company": `for` is null here only because the server hides
    // this cut from the reader, not because it tracks the whole company.
    expect(row().querySelector('[data-part="meta"]')).toHaveTextContent('Net revenue retention · Active · Carl CSM');
    expect(row().querySelector('[data-part="figures"]')).toHaveTextContent(DO.OUTSIDE_VIEW);
    expect(within(row()).queryByRole('progressbar')).toBeNull();
    expect(within(row()).queryByText(DO.NOT_MEASURABLE)).toBeNull();
    expect(button(DO.EDIT)).toBeInTheDocument();
    expect(button(DO.MARK_DONE)).toBeInTheDocument();
    // Target date, not days left (minor 3): `progress` carries `days_left`, so there is none to show.
    expect(row().querySelector('[data-part="when"]')).toHaveTextContent('by 31 Dec 2026');
    expect(row().querySelector('[data-part="when"]')).not.toHaveTextContent('left');
  });

  it('omits Target value when the figures are hidden, and the patch sends no target_value (I1, final review)', async () => {
    const { spy } = stubBrain({ offered: ['me', 'team'], viewAll: false, world: doingWorld([OUTSIDE_VIEW_INITIATIVE]) });
    render(<Harness initial={OUTSIDE_VIEW_INITIATIVE} />);
    await userEvent.click(button(DO.EDIT));
    const edit = within(row()).getByRole('form', { name: DO.EDIT_FORM });
    expect(within(edit).queryByLabelText(DO.FIELD_TARGET)).toBeNull();
    await userEvent.dblClick(within(edit).getByRole('button', { name: DO.SAVE }));
    await waitFor(() => expect(requests(spy, 'PATCH', '/brain/initiatives/')).toEqual(['/brain/initiatives/11/']));
    expect(bodies(spy, 'PATCH', '/brain/initiatives/')).toEqual([
      { title: OUTSIDE_VIEW_INITIATIVE.title, target_by: OUTSIDE_VIEW_INITIATIVE.target_by, hypothesis: OUTSIDE_VIEW_INITIATIVE.hypothesis },
    ]);
  });

  it('offers no Edit, Mark done or Abandon when the reader may not change it', () => {
    render(<Harness initial={{ ...CARL_INITIATIVE, can_edit: false }} />);
    for (const name of [DO.EDIT, DO.MARK_DONE, DO.ABANDON, DO.REOPEN]) expect(within(row()).queryByRole('button', { name })).toBeNull();
  });

  it('edits once, replaces the row, and hands focus back to Edit', async () => {
    const { spy } = stubBrain({ offered: ['me', 'team'], viewAll: false });
    const onChanged = vi.fn();
    render(<Harness initial={CARL_INITIATIVE} onChanged={onChanged} />);
    await userEvent.click(button(DO.EDIT));
    const edit = within(row()).getByRole('form', { name: DO.EDIT_FORM });
    const title = within(edit).getByLabelText(DO.FIELD_TITLE);
    expect(title).toHaveFocus();
    await userEvent.clear(title);
    await userEvent.type(title, 'Halve it by November');
    await userEvent.dblClick(within(edit).getByRole('button', { name: DO.SAVE }));
    await waitFor(() => expect(within(row()).getByRole('heading', { level: 3, name: 'Halve it by November' })).toBeInTheDocument());
    expect(requests(spy, 'PATCH', '/brain/initiatives/')).toEqual(['/brain/initiatives/3/']);
    expect(bodies(spy, 'PATCH', '/brain/initiatives/')).toEqual([
      { title: 'Halve it by November', hypothesis: CARL_INITIATIVE.hypothesis, target_value: '32000', target_by: '2026-11-30' },
    ]);
    expect(onChanged).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button(DO.EDIT)).toHaveFocus());
  });

  it('closes as done with what happened, then focuses Reopen; Reopen sends active and focuses Mark done', async () => {
    const { spy } = stubBrain({ offered: ['me', 'team'], viewAll: false });
    render(<Harness initial={CARL_INITIATIVE} />);
    await userEvent.click(button(DO.MARK_DONE));
    const close = within(row()).getByRole('form', { name: DO.CLOSE_DONE });
    await userEvent.type(within(close).getByLabelText(DO.WHAT_HAPPENED), 'Both renewals saved.');
    await userEvent.dblClick(within(close).getByRole('button', { name: DO.CLOSE_DONE }));
    await waitFor(() => expect(button(DO.REOPEN)).toHaveFocus());
    expect(row().querySelector('[data-part="meta"]')).toHaveTextContent('· Done ·');
    expect(row().querySelector('[data-part="when"]')).not.toHaveTextContent('days left');
    await userEvent.dblClick(button(DO.REOPEN));
    await waitFor(() => expect(button(DO.MARK_DONE)).toHaveFocus());
    expect(bodies(spy, 'PATCH', '/brain/initiatives/')).toEqual([{ status: 'done', outcome: 'Both renewals saved.' }, { status: 'active' }]);
  });

  it('Cancel closes the form and focuses the button that opened it', async () => {
    stubBrain({ offered: ['me', 'team'] });
    render(<Harness initial={CARL_INITIATIVE} />);
    await userEvent.click(button(DO.ABANDON));
    await userEvent.click(within(row()).getByRole('button', { name: DO.CANCEL }));
    expect(within(row()).queryByRole('form')).toBeNull();
    await waitFor(() => expect(button(DO.ABANDON)).toHaveFocus());
  });

  it('shows the server’s refusal at the buttons, focused, and keeps the row (§1.3)', async () => {
    stubBrain({ offered: ['me', 'team'], viewAll: false });
    const onChanged = vi.fn();
    // Dana's initiative: the fixture says can_edit, the server (Alice, not above Dana) says no.
    render(<Harness initial={{ ...DANA_INITIATIVE, status: 'active' }} onChanged={onChanged} />);
    await userEvent.click(button(DO.MARK_DONE));
    await userEvent.click(within(row()).getByRole('button', { name: DO.CLOSE_DONE }));
    const alert = await within(row()).findByRole('alert');
    expect(alert).toHaveTextContent("You can't change this initiative.");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('titles the initiative at body size, marks Abandon destructive, and keeps the progress track visible', () => {
    render(<Harness initial={CARL_INITIATIVE} />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveClass('text-[13px]', 'font-semibold');
    expect(screen.getByRole('button', { name: DO.ABANDON })).toHaveClass('text-danger-ink');
    expect(screen.getByRole('progressbar')).toHaveClass('bg-line');
    expect(document.body.innerHTML).not.toMatch(/font-mono-brand/);
  });
});

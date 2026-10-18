import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DO } from '../../features/brain/doingText';
import { bodies, requests, stubBrain } from '../../features/brain/testBrain';
import { BOOK_BODY, COMPANY_BODY, FIRST_NEW_ID, TRACKABLE_METRICS } from '../../features/brain/testDoingFixtures';
import { ALICE } from '../../features/brain/testDeskFixtures';
import { InitiativeForm } from './InitiativeForm';

const form = () => screen.getByRole('form', { name: DO.NEW });
const field = (label: string) => within(form()).getByLabelText(label);
const optionsOf = (label: string) => within(field(label)).getAllByRole('option').map((o) => o.textContent);
const save = () => within(form()).getByRole('button', { name: DO.SAVE_INITIATIVE });
// TRACKABLE_METRICS (controller override) is not in OWNER_CUT_METRICS order
// (which doesn't exist): the first metric a book form selects, until told
// otherwise, is whatever the page's own `trackable` prop lists first.
const ARR_AT_RISK = TRACKABLE_METRICS.find((m) => m.key === 'at_risk_arr')!.label;

async function fill(body: { title: string; target_value: string; target_by: string } = BOOK_BODY) {
  await userEvent.type(field(DO.FIELD_TITLE), body.title);
  await userEvent.type(field(DO.FIELD_TARGET), body.target_value);
  fireEvent.change(field(DO.FIELD_TARGET_BY), { target: { value: body.target_by } });
}

describe('InitiativeForm (spec §2.1, Decision 3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('Me: offers only the trackable metrics the page passes in, no cut, owner or whose book, and starts it once on my book', async () => {
    const { spy } = stubBrain({ offered: ['me', 'team'] });
    const onSaved = vi.fn();
    render(<InitiativeForm mode="book" scope="me" reader={ALICE} trackable={TRACKABLE_METRICS} onSaved={onSaved} onCancel={vi.fn()} />);
    expect(field(DO.FIELD_TITLE)).toHaveFocus();
    expect(optionsOf(DO.FIELD_METRIC)).toEqual(TRACKABLE_METRICS.map((m) => m.label));
    expect(within(form()).getByText(DO.OWNER_CUT_HINT)).toBeInTheDocument();
    for (const label of [DO.FIELD_CUT, DO.FIELD_OWNER, DO.FIELD_WHOSE_BOOK]) expect(within(form()).queryByLabelText(label)).toBeNull();
    await userEvent.selectOptions(field(DO.FIELD_METRIC), ARR_AT_RISK);
    await fill();
    await userEvent.dblClick(save());
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(FIRST_NEW_ID));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(requests(spy, 'POST', '/brain/initiatives/')).toEqual(['/brain/initiatives/?scope=me']);
    expect(bodies(spy, 'POST', '/brain/initiatives/')).toEqual([{ ...BOOK_BODY, hypothesis: '' }]);
    expect(requests(spy, 'GET', '/metrics/')).toEqual([]);
    expect(requests(spy, 'GET', '/auth/members/')).toEqual([]);
  });

  it('My team: "Whose book" offers me and the people below me, and sends who (Contract note 4)', async () => {
    const { spy } = stubBrain({ offered: ['me', 'team'] });
    render(<InitiativeForm mode="book" scope="team" reader={ALICE} trackable={TRACKABLE_METRICS} onSaved={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(optionsOf(DO.FIELD_WHOSE_BOOK)).toEqual(['Alice Admin', 'Carl CSM']));
    await userEvent.selectOptions(field(DO.FIELD_WHOSE_BOOK), 'Carl CSM');
    await userEvent.selectOptions(field(DO.FIELD_METRIC), ARR_AT_RISK);
    await fill();
    await userEvent.click(save());
    await waitFor(() => expect(bodies(spy, 'POST', '/brain/initiatives/')).toEqual([{ ...BOOK_BODY, hypothesis: '', for_user: 5 }]));
    expect(requests(spy, 'POST', '/brain/initiatives/')).toEqual(['/brain/initiatives/?scope=team']);
  });

  it('offers only me when the members cannot be read', async () => {
    const { spy } = stubBrain({ offered: ['me', 'team'], failMembers: 1 });
    render(<InitiativeForm mode="book" scope="team" reader={ALICE} trackable={TRACKABLE_METRICS} onSaved={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(requests(spy, 'GET', '/auth/members/')).toHaveLength(1));
    expect(optionsOf(DO.FIELD_WHOSE_BOOK)).toEqual(['Alice Admin']);
  });

  it('says Saving… and sends nothing more while the start is on its way', async () => {
    const { spy, releaseWrites } = stubBrain({ offered: ['me', 'team'], holdWrites: true });
    const onSaved = vi.fn();
    render(<InitiativeForm mode="book" scope="me" reader={ALICE} trackable={TRACKABLE_METRICS} onSaved={onSaved} onCancel={vi.fn()} />);
    await fill();
    await userEvent.click(save());
    const saving = within(form()).getByRole('button', { name: DO.SAVING });
    expect(saving).toBeDisabled();
    fireEvent.submit(form());
    releaseWrites();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(requests(spy, 'POST', '/brain/initiatives/')).toHaveLength(1);
  });

  it('puts a field’s refusal under it and focuses it, then lets a retry through', async () => {
    const onSaved = vi.fn();
    stubBrain({ offered: ['me', 'team'], refuseNextInitiative: { status: 400, body: { title: ['Give it a shorter title.'] } } });
    render(<InitiativeForm mode="book" scope="me" reader={ALICE} trackable={TRACKABLE_METRICS} onSaved={onSaved} onCancel={vi.fn()} />);
    await fill();
    await userEvent.click(save());
    expect(await within(form()).findByText('Give it a shorter title.')).toBeInTheDocument();
    await waitFor(() => expect(field(DO.FIELD_TITLE)).toHaveFocus());
    expect(field(DO.FIELD_TITLE)).toHaveAttribute('aria-invalid', 'true');
    expect(field(DO.FIELD_TITLE)).toHaveAccessibleDescription('Give it a shorter title.');
    await userEvent.click(save());
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(FIRST_NEW_ID));
  });

  it('shows the server’s sentence at the foot of the form, focused', async () => {
    stubBrain({ offered: ['me', 'team'], refuseNextInitiative: { status: 400, body: { detail: "That number can't be tracked for one person's book." } } });
    render(<InitiativeForm mode="book" scope="me" reader={ALICE} trackable={TRACKABLE_METRICS} onSaved={vi.fn()} onCancel={vi.fn()} />);
    await fill();
    await userEvent.click(save());
    const alert = await within(form()).findByRole('alert');
    expect(alert).toHaveTextContent("That number can't be tracked for one person's book.");
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('shows a plain line instead of an empty select, and disables Save, when nothing is trackable on a book (controller item (c))', async () => {
    stubBrain({ offered: ['me', 'team'] });
    render(<InitiativeForm mode="book" scope="me" reader={ALICE} trackable={[]} onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(within(form()).queryByLabelText(DO.FIELD_METRIC)).toBeNull();
    expect(within(form()).getByText(DO.NO_TRACKABLE)).toBeInTheDocument();
    expect(within(form()).queryByText(DO.OWNER_CUT_HINT)).toBeNull();
    expect(save()).toBeDisabled();
    // Final review (minor): no control wears the metric field's id here, so
    // the label must not point at one with a dangling `htmlFor`.
    expect(within(form()).getByText(DO.FIELD_METRIC).closest('label')).not.toHaveAttribute('for');
  });

  it('Company: the existing form, any metric, a cut and an owner, through /metrics/initiatives/ (Contract note 8)', async () => {
    const { spy } = stubBrain();
    const onSaved = vi.fn();
    render(<InitiativeForm mode="company" onSaved={onSaved} onCancel={vi.fn()} />);
    await waitFor(() => expect(optionsOf(DO.FIELD_METRIC)).toEqual(['ARR at risk', 'Net revenue retention', 'Active customers']));
    expect(optionsOf(DO.FIELD_CUT)).toEqual(['Whole company', 'By owner', 'By product']);
    expect(within(form()).queryByText(DO.OWNER_CUT_HINT)).toBeNull();
    await userEvent.selectOptions(field(DO.FIELD_CUT), 'By owner');
    await waitFor(() => expect(optionsOf('Which owner')).toContain('Carl CSM'));
    await userEvent.selectOptions(field('Which owner'), 'Carl CSM');
    await waitFor(() => expect(optionsOf(DO.FIELD_OWNER)).toContain('Carl CSM'));
    await userEvent.selectOptions(field(DO.FIELD_OWNER), 'Carl CSM');
    await fill(COMPANY_BODY);
    await userEvent.click(save());
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(FIRST_NEW_ID));
    expect(bodies(spy, 'POST', '/metrics/initiatives/')).toEqual([COMPANY_BODY]);
    expect(requests(spy, 'POST', '/brain/initiatives/')).toEqual([]);
  });

  it('Company: says so, and saves nothing, when the metrics cannot be read', async () => {
    stubBrain({ offered: ['company'], viewAll: false });
    render(<InitiativeForm mode="company" onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(await within(form()).findByText(DO.LOAD_METRICS)).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('Cancel hands back without sending', async () => {
    const { spy } = stubBrain({ offered: ['me', 'team'] });
    const onCancel = vi.fn();
    render(<InitiativeForm mode="book" scope="me" reader={ALICE} trackable={TRACKABLE_METRICS} onSaved={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(within(form()).getByRole('button', { name: DO.CANCEL }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(requests(spy, 'POST', '/')).toEqual([]);
  });
});

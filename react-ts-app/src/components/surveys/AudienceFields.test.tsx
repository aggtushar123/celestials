import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CHAMPIONS, EMEA_ACCOUNTS, listRow, RENEWAL_RISK } from '../../features/segments/testSegments';
import { DEFAULT_ROLES } from '../../features/surveys/questions';
import { AudienceFields } from './AudienceFields';

const MINE = [listRow(RENEWAL_RISK), { ...listRow(EMEA_ACCOUNTS), is_owner: true }, listRow(CHAMPIONS)];

function renderFields(props: Partial<Parameters<typeof AudienceFields>[0]> = {}) {
  const onSegment = vi.fn();
  const onRoles = vi.fn();
  render(
    <MemoryRouter>
      <AudienceFields
        segments={MINE}
        segmentsError={null}
        segmentId={null}
        fallback={null}
        roles={DEFAULT_ROLES}
        kind={null}
        errors={{}}
        onSegment={onSegment}
        onRoles={onRoles}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onSegment, onRoles };
}

describe('AudienceFields (spec §2.2)', () => {
  it('offers my segments grouped by kind, and reports the one chosen', async () => {
    const { onSegment } = renderFields();
    const select = screen.getByRole('combobox', { name: 'Segment' });
    expect(select.querySelector('optgroup[label="Organisations"]')).toHaveTextContent('Renewal risk');
    expect(select.querySelector('optgroup[label="Accounts"]')).toHaveTextContent('EMEA accounts');
    expect(select.querySelector('optgroup[label="Contacts"]')).toHaveTextContent('Champions');
    await userEvent.selectOptions(select, '7');
    expect(onSegment).toHaveBeenCalledWith(7);
  });

  it('shows the roles for an organisation segment, Champion and Decision Maker ticked, adding in the order ticked', async () => {
    const { onRoles } = renderFields({ segmentId: 7, kind: 'customer' });
    const roles = screen.getByRole('group', { name: 'Who to ask at each organisation' });
    expect(within(roles).getByRole('checkbox', { name: 'Champion' })).toBeChecked();
    expect(within(roles).getByRole('checkbox', { name: 'Decision Maker' })).toBeChecked();
    expect(within(roles).getByRole('checkbox', { name: 'Influencer' })).not.toBeChecked();
    expect(roles).toHaveAccessibleDescription('Up to 3 people per organisation, in the order you tick the roles.');
    await userEvent.click(within(roles).getByRole('checkbox', { name: 'Influencer' }));
    expect(onRoles).toHaveBeenLastCalledWith(['champion', 'decision_maker', 'influencer']);
    await userEvent.click(within(roles).getByRole('checkbox', { name: 'Champion' }));
    expect(onRoles).toHaveBeenLastCalledWith(['decision_maker']);
  });

  it('asks at each account for an account segment', () => {
    renderFields({ segmentId: 8, kind: 'account' });
    expect(screen.getByRole('group', { name: 'Who to ask at each account' })).toHaveAccessibleDescription('Up to 3 people per account, in the order you tick the roles.');
  });

  it('shows no roles for a contact segment', () => {
    renderFields({ segmentId: 9, kind: 'contact' });
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('says when I have no segments yet, and links to a new one', () => {
    renderFields({ segments: [] });
    expect(screen.getByText(/You have no segments yet\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Make one' })).toHaveAttribute('href', '/segments/new');
  });

  it('waits for the segments, and says when they could not be read', () => {
    renderFields({ segments: null });
    expect(screen.getByRole('combobox', { name: 'Segment' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Segment' })).toHaveDisplayValue('Loading your segments…');
  });

  it('shows a load failure and errors at the segment and the roles', () => {
    renderFields({ segments: [], segmentsError: 'Segments are down.', segmentId: 7, kind: 'customer', roles: [], errors: { segment: 'Nobody to send to.', roles: 'Choose at least one role.' } });
    expect(screen.getByRole('combobox', { name: 'Segment' })).toHaveAccessibleDescription(/Nobody to send to\./);
    const alerts = screen.getAllByRole('alert').map((alert) => alert.textContent);
    expect(alerts).toEqual(['Nobody to send to.', 'Segments are down.', 'Choose at least one role.']);
  });

  it("keeps a draft's own segment as an option when it is not among mine", () => {
    renderFields({ segments: [], segmentId: 12, fallback: { id: 12, name: 'Old list', kind: 'contact' }, kind: 'contact' });
    expect(screen.getByRole('combobox', { name: 'Segment' })).toHaveDisplayValue('Old list');
  });
});

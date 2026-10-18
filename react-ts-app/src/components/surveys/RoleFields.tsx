import { useId } from 'react';
import { CONTACT_ROLES } from '../../features/contacts/contactsParams';
import type { SegmentKind } from '../../features/segments/segmentTypes';
import type { ContactRole } from '../../features/surveys/surveyTypes';
import { FOCUS } from '../organizations/portfolio/styles';
import { TYPE } from '../ui';

const LABEL = TYPE.label;

/** Which roles to ask (or email) at each organisation or account, in the
 *  order ticked (Surveys spec §2.2; the backend asks in that order, at most
 *  3 per record). Shared by the survey builder, a rule's Send a survey
 *  card, and a campaign's audience. Nothing for a contact segment, or
 *  before a segment is chosen. */
export function RoleFields({ kind, roles, error, onRoles, verb = 'ask' }: { kind: SegmentKind | null; roles: ContactRole[]; error?: string; onRoles: (roles: ContactRole[]) => void; verb?: 'ask' | 'email' }) {
  const rolesId = useId();
  if (kind !== 'customer' && kind !== 'account') return null;
  const place = kind === 'account' ? 'account' : 'organisation';
  const toggle = (role: ContactRole, on: boolean) => onRoles(on ? [...roles, role] : roles.filter((ticked) => ticked !== role));
  return (
    <fieldset aria-describedby={`${rolesId}-hint`} className="flex flex-col gap-1">
      <legend className={`${LABEL} mb-1`}>Who to {verb} at each {place}</legend>
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        {CONTACT_ROLES.map((role) => (
          <label key={role.value} className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-ink sm:min-h-9">
            <input type="checkbox" checked={roles.includes(role.value)} onChange={(event) => toggle(role.value, event.target.checked)} className="h-4 w-4 accent-accent" />
            {role.label}
          </label>
        ))}
      </div>
      <p id={`${rolesId}-hint`} className="text-[11px] text-ink-muted">
        Up to 3 people per {place}, in the order you tick the roles.
      </p>
      {error ? (
        // Focusable: a refusal here has no field marked invalid to land on.
        <p role="alert" data-error tabIndex={-1} className={`text-[11px] text-danger ${FOCUS}`}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

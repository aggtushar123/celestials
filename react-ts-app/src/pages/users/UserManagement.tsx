import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { FUNCTION_LABELS } from '../../features/auth/authSlice';
import type { UserFunction } from '../../features/auth/authSlice';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { BuilderDialog } from '../../components/segments/BuilderDialog';
import {
  BUTTON,
  Badge,
  CHECKBOX,
  EmptyState,
  FIELD_ERROR,
  FORM_ALERT,
  ICON_BUTTON,
  INPUT,
  INVALID,
  LoadingState,
  NUM,
  OverflowMenu,
  PRIMARY,
  QUIET,
  ROW_ACTIONS,
  Select,
  SettingsFrame,
  SettingsRow,
  SettingsSection,
  TABLE,
  TD,
  TH,
  TYPE,
  Tabs,
  tabId,
  tabPanelId,
  ScrollTable,
} from '../../components/ui';
import {
  addMember,
  addRole,
  clearUserManagementError,
  deleteRole,
  fetchCapabilities,
  fetchMembers,
  fetchRoles,
  updateMember,
  updateRole,
  type Member,
  type Role,
} from '../../features/userManagement/userManagementSlice';
import type { Capability } from '../../features/auth/authSlice';
import { settingsTitle } from '../settings/workspaceSettingsNav';
import { AccessTab } from './AccessTab';
import { DepartmentHeadsSection } from './DepartmentHeadsSection';

// Settings > Workspace > People & teams: Members, Roles and Access (AccessTab.tsx).
// Members also holds Department heads (DepartmentHeadsSection.tsx, Slack escalations D2).
// Reachable with manage_users, which the backend enforces on every endpoint here.

type PeopleTab = 'members' | 'roles' | 'access';
const TABS: { key: PeopleTab; label: string }[] = [
  { key: 'members', label: 'Members' },
  { key: 'roles', label: 'Roles' },
  { key: 'access', label: 'Access' },
];
const ID = 'people';
const FUNCTIONS = (Object.keys(FUNCTION_LABELS) as UserFunction[]).map((key) => ({ value: key, label: FUNCTION_LABELS[key] }));
// A disabled capability (a built-in role): the words in the muted ink, the box not clickable.
const CHOICE_OFF = 'flex min-h-11 sm:min-h-9 cursor-not-allowed items-center gap-2 text-[13px] leading-5 text-ink-muted';
const CHOICE_ON = 'flex min-h-11 sm:min-h-9 cursor-pointer items-center gap-2 text-[13px] leading-5 text-ink';

export function UserManagement() {
  const dispatch = useAppDispatch();
  const { members, roles, isLoading, error } = useAppSelector((state) => state.userManagement);
  const [tab, setTab] = useState<PeopleTab>('members');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [deactivating, setDeactivating] = useState<Member | null>(null);

  useEffect(() => {
    dispatch(fetchMembers());
    dispatch(fetchRoles());
    dispatch(fetchCapabilities());
  }, [dispatch]);

  return (
    <SettingsFrame
      title={settingsTitle('/settings/people')}
      intro="The people in your organisation and what each role is allowed to do."
      action={
        tab === 'members' ? (
          <button type="button" onClick={() => setShowAddModal(true)} className={BUTTON}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add team member
          </button>
        ) : undefined
      }
    >
      <div className="h-11 border-b border-line-subtle">
        <Tabs
          label="People sections"
          idBase={ID}
          items={TABS}
          value={tab}
          onChange={(next) => {
            setTab(next);
            dispatch(clearUserManagementError());
          }}
        />
      </div>
      <div role="tabpanel" id={tabPanelId(ID, tab)} aria-labelledby={tabId(ID, tab)} className="flex flex-col gap-6">
        {error ? (
          <p role="alert" className={FORM_ALERT}>
            {error}
          </p>
        ) : null}
        {tab === 'members' ? (
          <>
            <MembersTab members={members} roles={roles} isLoading={isLoading} onEdit={setEditingMember} onDeactivate={setDeactivating} />
            <DepartmentHeadsSection members={members} membersLoading={isLoading} />
          </>
        ) : null}
        {tab === 'roles' ? <RolesTab /> : null}
        {tab === 'access' ? <AccessTab roles={roles} /> : null}
      </div>
      {showAddModal ? <AddMemberModal roles={roles} onClose={() => setShowAddModal(false)} /> : null}
      {editingMember ? <EditMemberModal member={editingMember} onClose={() => setEditingMember(null)} /> : null}
      {deactivating ? (
        <ConfirmDialog
          title={`Deactivate ${deactivating.name}?`}
          message="They can no longer sign in. You can reactivate them at any time."
          confirmLabel="Deactivate"
          danger
          onConfirm={async () => {
            await dispatch(updateMember({ id: deactivating.id, is_active: false })).unwrap();
          }}
          onClose={() => setDeactivating(null)}
        />
      ) : null}
    </SettingsFrame>
  );
}

function MembersTab({ members, roles, isLoading, onEdit, onDeactivate }: { members: Member[]; roles: Role[]; isLoading: boolean; onEdit: (member: Member) => void; onDeactivate: (member: Member) => void }) {
  return (
    <SettingsSection look="card"
      title="Members"
      action={<span className={`${TYPE.meta} ${NUM}`}>{members.length}</span>}
      state={isLoading && members.length === 0 ? <LoadingState label="Loading members" /> : members.length === 0 ? <EmptyState title="No team members yet." /> : undefined}
    >
      <ScrollTable>
        <table className={TABLE}>
          <thead>
            <tr>
              {['Name', 'Email', 'Role', 'Function', 'Manager', 'Status'].map((label) => (
                <th key={label} scope="col" className={TH}>
                  {label}
                </th>
              ))}
              <th scope="col" className={TH}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {members.map((member) => (
              <MemberRow key={member.id} member={member} roles={roles} members={members} onEdit={() => onEdit(member)} onDeactivate={() => onDeactivate(member)} />
            ))}
          </tbody>
        </table>
      </ScrollTable>
    </SettingsSection>
  );
}

function MemberRow({ member, roles, members, onEdit, onDeactivate }: { member: Member; roles: Role[]; members: Member[]; onEdit: () => void; onDeactivate: () => void }) {
  const dispatch = useAppDispatch();
  return (
    <tr>
      <td className={TD}>
        <div className="flex items-center gap-2.5">
          <img src={member.avatar} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
          <span className="truncate font-semibold">{member.name}</span>
          {/* Below sm the Status column is a scroll away: the badge sits by the name. */}
          {member.is_active ? null : (
            <span data-narrow-only="" className="sm:hidden">
              <Badge>Deactivated</Badge>
            </span>
          )}
        </div>
      </td>
      <td className={`${TD} text-ink-muted`}>
        {/* A block inside the cell: table cells ignore max-width (fix round 1). */}
        <span title={member.email} className="block max-w-[16rem] truncate">
          {member.email}
        </span>
      </td>
      <td className={TD}>
        {/* Inline, so reassigning somebody is one choice. The backend refuses to strip the last person who can manage users; that refusal lands in the page alert. */}
        <Select
          label={`Role for ${member.name}`}
          labelPosition="hidden"
          value={String(member.role_id ?? '')}
          onChange={(value) => dispatch(updateMember({ id: member.id, role_id: Number(value) }))}
          options={roles.map((role) => ({ value: String(role.id), label: role.name }))}
          className="min-w-36"
        />
      </td>
      <td className={TD}>
        {/* Where they work: stamps their contributions and finds "the responsible person". Not a permission. */}
        <Select
          label={`Function for ${member.name}`}
          labelPosition="hidden"
          value={member.function}
          onChange={(value) => dispatch(updateMember({ id: member.id, function: value }))}
          options={FUNCTIONS}
          className="min-w-36"
        />
      </td>
      <td className={TD}>
        {/* The org chart: what a person may see of what others say is read from it. The backend refuses a loop. */}
        <Select
          label={`Manager for ${member.name}`}
          labelPosition="hidden"
          value={String(member.reports_to?.id ?? '')}
          onChange={(value) => dispatch(updateMember({ id: member.id, reports_to_id: value ? Number(value) : null }))}
          options={[{ value: '', label: 'Nobody' }, ...members.filter((m) => m.id !== member.id).map((m) => ({ value: String(m.id), label: m.name }))]}
          className="min-w-40 max-w-[12rem]"
        />
      </td>
      <td className={TD}>{member.is_active ? <span className="text-ink-muted">Active</span> : <Badge>Deactivated</Badge>}</td>
      <td className={`${TD} text-right`}>
        <OverflowMenu
          label={`Actions for ${member.name}`}
          items={[
            { key: 'edit', label: 'Edit', onSelect: onEdit },
            member.is_active
              ? { key: 'deactivate', label: 'Deactivate', onSelect: onDeactivate, danger: true }
              : { key: 'reactivate', label: 'Reactivate', onSelect: () => void dispatch(updateMember({ id: member.id, is_active: true })) },
          ]}
        />
      </td>
    </tr>
  );
}

function RolesTab() {
  const dispatch = useAppDispatch();
  const { roles, capabilities } = useAppSelector((state) => state.userManagement);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPermissions, setNewPermissions] = useState<Capability[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const returnToOpener = useRef(false);
  const deleted = useRef(false);

  // The form's opener is not on screen while the form is, so focus goes back to it once it returns.
  useEffect(() => {
    if (!showAddForm && returnToOpener.current) {
      returnToOpener.current = false;
      openerRef.current?.focus();
    }
  }, [showAddForm]);

  function resetForm() {
    returnToOpener.current = true;
    setShowAddForm(false);
    setNewName('');
    setNewPermissions([]);
    setAddError(null);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (isSaving || !newName.trim()) return;
    setAddError(null);
    setIsSaving(true);
    try {
      await dispatch(addRole({ name: newName, permissions: newPermissions })).unwrap();
      resetForm();
    } catch (err) {
      setAddError(typeof err === 'string' ? err : 'Could not create this role.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      {showAddForm ? (
        <form onSubmit={handleAdd} aria-label="New role">
          <SettingsSection look="card"
            title="New role"
            footer={
              <>
                <button type="button" onClick={resetForm} className={QUIET}>
                  Cancel
                </button>
                <button type="submit" aria-disabled={isSaving || !newName.trim() || undefined} className={PRIMARY}>
                  {isSaving ? 'Creating…' : 'Create role'}
                </button>
              </>
            }
          >
            <SettingsRow label="Role name" htmlFor="new-role-name" error={addError ?? undefined} errorId="new-role-error">
              <input
                id="new-role-name"
                type="text"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                autoFocus
                aria-invalid={Boolean(addError)}
                aria-describedby={addError ? 'new-role-error' : undefined}
                className={`${INPUT} ${INVALID}`}
              />
            </SettingsRow>
            <SettingsRow label="Permissions" group stacked>
              <CapabilityCheckboxes capabilities={capabilities} selected={newPermissions} onChange={setNewPermissions} />
            </SettingsRow>
          </SettingsSection>
        </form>
      ) : null}

      <SettingsSection look="card"
        title="Roles"
        description="A role grants a set of permissions. The built-in Admin and CSM roles can't be changed."
        action={
          showAddForm ? undefined : (
            <button ref={openerRef} type="button" onClick={() => setShowAddForm(true)} className={BUTTON}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New role
            </button>
          )
        }
        list="Roles"
        listRef={listRef}
      >
        {roles.map((role) => (
          <RoleRow key={role.id} role={role} capabilities={capabilities} onDelete={() => setDeleteTarget(role)} />
        ))}
      </SettingsSection>

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete the "${deleteTarget.name}" role?`}
          message="This can't be undone. Anyone still holding it must be moved to another role first."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await dispatch(deleteRole(deleteTarget.id)).unwrap();
            deleted.current = true;
          }}
          onClose={() => {
            setDeleteTarget(null);
            // The row that opened the dialog is gone: focus lands on the list.
            if (deleted.current) {
              deleted.current = false;
              window.setTimeout(() => listRef.current?.focus(), 0);
            }
          }}
        />
      )}
    </>
  );
}

function RoleRow({ role, capabilities, onDelete }: { role: Role; capabilities: { key: Capability; label: string }[]; onDelete: () => void }) {
  const dispatch = useAppDispatch();
  function toggle(capability: Capability, checked: boolean) {
    const next = checked ? [...role.permissions, capability] : role.permissions.filter((c) => c !== capability);
    dispatch(updateRole({ id: role.id, permissions: next }));
  }
  return (
    <li className="group relative flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <p className={`${TYPE.body} font-semibold`}>{role.name}</p>
        {role.is_system ? <Badge>Built-in</Badge> : null}
        <span className={TYPE.meta}>
          <span className={NUM}>{role.users_count}</span> {role.users_count === 1 ? 'person' : 'people'}
        </span>
        {role.is_system ? null : (
          <div className={`ml-auto ${ROW_ACTIONS}`}>
            <button type="button" onClick={onDelete} aria-label={`Delete ${role.name}`} className={ICON_BUTTON}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <CapabilityCheckboxes capabilities={capabilities} selected={role.permissions} onChange={() => {}} onToggle={role.is_system ? undefined : toggle} disabled={role.is_system} />
    </li>
  );
}

function CapabilityCheckboxes({
  capabilities,
  selected,
  onChange,
  onToggle,
  disabled,
}: {
  capabilities: { key: Capability; label: string }[];
  selected: Capability[];
  onChange: (next: Capability[]) => void;
  /** Provided when each tick should save at once (an existing role); otherwise the form collects them and submits once. */
  onToggle?: (capability: Capability, checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
      {capabilities.map((capability) => (
        <label key={capability.key} className={disabled ? CHOICE_OFF : CHOICE_ON}>
          <input
            type="checkbox"
            disabled={disabled}
            checked={selected.includes(capability.key)}
            onChange={(event) => {
              if (onToggle) {
                onToggle(capability.key, event.target.checked);
                return;
              }
              onChange(event.target.checked ? [...selected, capability.key] : selected.filter((c) => c !== capability.key));
            }}
            className={CHECKBOX}
          />
          {capability.label}
        </label>
      ))}
    </div>
  );
}

/** A dialog field: the label above, a hint and an error under it, the control naming both. */
function Field({
  label,
  id,
  hint,
  error,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  error?: string | null;
  children: (described: string | undefined) => ReactNode;
}) {
  const described = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={TYPE.label}>
        {label}
      </label>
      {children(described)}
      {hint ? (
        <p id={`${id}-hint`} className={TYPE.meta}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className={FIELD_ERROR}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

const DIALOG_BODY = 'flex flex-col gap-4 overflow-y-auto px-4 py-4';
const DIALOG_FOOTER = 'flex justify-end gap-2 border-t border-line-subtle px-4 py-3';

function AddMemberModal({ roles, onClose }: { roles: Role[]; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const ids = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [fn, setFn] = useState<UserFunction>('cs');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSaving || !name || !email || !password) return;
    setError(null);
    setPasswordError(null);
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    setIsSaving(true);
    try {
      await dispatch(addMember({ name, email, password, function: fn, ...(roleId ? { role_id: Number(roleId) } : {}) })).unwrap();
      onClose();
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Could not add team member.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <BuilderDialog title="Add team member" size="narrow" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-col">
        <div className={DIALOG_BODY}>
          <Field label="Name" id={`${ids}-name`}>
            {(described) => <input id={`${ids}-name`} type="text" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} aria-describedby={described} className={INPUT} />}
          </Field>
          <Field label="Email" id={`${ids}-email`}>
            {(described) => <input id={`${ids}-email`} type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} aria-describedby={described} className={INPUT} />}
          </Field>
          <Select label="Function" value={fn} onChange={setFn} options={FUNCTIONS} />
          <Select label="Role" value={roleId} onChange={setRoleId} options={[{ value: '', label: 'CSM (default)' }, ...roles.map((role) => ({ value: String(role.id), label: role.name }))]} />
          <Field label="Temporary password" id={`${ids}-password`} hint="Share this with them directly: no invite email is sent." error={passwordError}>
            {(described) => (
              <input
                id={`${ids}-password`}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(passwordError)}
                aria-describedby={described}
                className={`${INPUT} ${INVALID}`}
              />
            )}
          </Field>
          {error ? (
            <p role="alert" className={FORM_ALERT}>
              {error}
            </p>
          ) : null}
        </div>
        <div className={DIALOG_FOOTER}>
          <button type="button" onClick={onClose} className={QUIET}>
            Cancel
          </button>
          <button type="submit" aria-disabled={isSaving || !name || !email || !password || undefined} className={PRIMARY}>
            {isSaving ? 'Adding…' : 'Add member'}
          </button>
        </div>
      </form>
    </BuilderDialog>
  );
}

function EditMemberModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const ids = useId();
  const [name, setName] = useState(member.name);
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSaving || !name.trim()) return;
    setError(null);
    setPasswordError(null);
    if (newPassword && newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    setIsSaving(true);
    try {
      await dispatch(updateMember({ id: member.id, name, ...(newPassword ? { password: newPassword } : {}) })).unwrap();
      onClose();
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Could not update team member.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <BuilderDialog title={`Edit ${member.name}`} size="narrow" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-col">
        <div className={DIALOG_BODY}>
          <Field label="Name" id={`${ids}-name`}>
            {(described) => <input id={`${ids}-name`} type="text" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} aria-describedby={described} className={INPUT} />}
          </Field>
          <Field
            label="Reset password (optional)"
            id={`${ids}-password`}
            hint="Sets a new password directly: share it with them yourself."
            error={passwordError}
          >
            {(described) => (
              <input
                id={`${ids}-password`}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Leave blank to keep the current password"
                aria-invalid={Boolean(passwordError)}
                aria-describedby={described}
                className={`${INPUT} ${INVALID}`}
              />
            )}
          </Field>
          {error ? (
            <p role="alert" className={FORM_ALERT}>
              {error}
            </p>
          ) : null}
        </div>
        <div className={DIALOG_FOOTER}>
          <button type="button" onClick={onClose} className={QUIET}>
            Cancel
          </button>
          <button type="submit" aria-disabled={isSaving || !name.trim() || undefined} className={PRIMARY}>
            {isSaving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </BuilderDialog>
  );
}

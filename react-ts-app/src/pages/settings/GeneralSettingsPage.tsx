import { useEffect, useId, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { fetchMe } from '../../features/auth/authSlice';
import { fetchMembers } from '../../features/userManagement/userManagementSlice';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { CODE, DANGER, Select, SettingsFrame, SettingsNote, SettingsRow, SettingsSection, TYPE } from '../../components/ui';
import { settingsTitle } from './workspaceSettingsNav';
import { ownershipErrorMessage, transferOwnership } from './ownershipApi';

/** Settings › Workspace › General (settings spec 2026-10-06 §3.1): the
 *  workspace's identity, and the one owner-only action that had no home.
 *  Rename, timezone and working hours are not here on purpose: there is no
 *  backend field for them and nothing would read them yet. */
export function GeneralSettingsPage() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const members = useAppSelector((state) => state.userManagement.members);
  // The login payload has no `is_owner`; until /auth/me/ answers (or if it
  // fails) the organisation's owner tells us, so the owner never waits on it.
  const isOwner = !!user && (user.is_owner ?? user.organisation.owner?.id === user.id);
  const pickerId = useId();
  const ownershipHeadingRef = useRef<HTMLHeadingElement>(null);
  const [pickedId, setPickedId] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [membersFailed, setMembersFailed] = useState(false);
  const [passedTo, setPassedTo] = useState<string | null>(null);

  // `is_owner` only ever comes from /auth/me/, never the login payload.
  useEffect(() => {
    dispatch(fetchMe());
  }, [dispatch]);

  // The members list needs manage_users; only the owner's picker reads it.
  useEffect(() => {
    if (!isOwner) return;
    dispatch(fetchMembers())
      .unwrap()
      .then(
        () => setMembersFailed(false),
        () => setMembersFailed(true),
      );
  }, [dispatch, isOwner]);

  // The Transfer button unmounts with the picker, so focus goes to the heading.
  useEffect(() => {
    if (passedTo) ownershipHeadingRef.current?.focus();
  }, [passedTo]);

  if (!user) return null;
  const organisation = user.organisation;
  const ownerName = organisation.owner?.name ?? null;
  const candidates = members.filter((member) => member.is_active && member.id !== user.id);
  const picked = candidates.find((member) => String(member.id) === pickedId) ?? null;

  async function handleTransfer(to: number, name: string) {
    setError(null);
    setPassedTo(null);
    try {
      await transferOwnership(to);
      setPassedTo(name);
      await dispatch(fetchMe());
    } catch (err) {
      setError(ownershipErrorMessage(err));
    }
  }

  return (
    <SettingsFrame title={settingsTitle('/settings/general')} intro="This workspace, and who owns it.">
      <SettingsSection look="card" title="Workspace">
        <SettingsRow label="Name">
          <p className={TYPE.body}>{organisation.name}</p>
        </SettingsRow>
        <SettingsRow label="Slug">
          <p className={`${TYPE.body} ${CODE}`}>{organisation.slug}</p>
        </SettingsRow>
        <SettingsRow label="Owner">
          <p className={TYPE.body}>{ownerName ?? 'Not set'}</p>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection look="card"
        title="Danger zone"
        variant="danger"
        description="Hand the workspace to another member. You keep your role."
        headingRef={ownershipHeadingRef}
        footer={
          <>
            {/* Outside the owner branch: the transfer makes this person a member, and the news must survive that. */}
            <p role="status" className={`mr-auto ${TYPE.bodyMuted}`}>
              {passedTo ? `Ownership passed to ${passedTo}.` : ''}
            </p>
            {isOwner ? (
              <button type="button" disabled={!picked} onClick={() => setIsConfirming(true)} className={DANGER}>
                Transfer ownership
              </button>
            ) : null}
          </>
        }
      >
        {isOwner ? (
          <SettingsRow
            label="New owner"
            htmlFor={pickerId}
            hint="An active member other than you."
            error={error ?? (membersFailed ? 'Could not load members.' : undefined)}
            errorId={`${pickerId}-error`}
          >
            <Select
              id={pickerId}
              label="New owner"
              labelPosition="external"
              value={pickedId}
              invalid={Boolean(error)}
              describedBy={error || membersFailed ? `${pickerId}-error` : undefined}
              onChange={setPickedId}
              options={[{ value: '', label: 'Choose a member' }, ...candidates.map((member) => ({ value: String(member.id), label: member.name }))]}
              className="sm:max-w-sm"
            />
          </SettingsRow>
        ) : (
          <div className="px-4 py-3">
            <SettingsNote icon="lock">{ownerName ? `Only the owner, ${ownerName}, can hand the workspace on.` : 'Only the owner can hand the workspace on.'}</SettingsNote>
          </div>
        )}
      </SettingsSection>

      {isConfirming && picked && (
        <ConfirmDialog
          title={`Transfer ownership to ${picked.name}?`}
          message={`${picked.name} becomes the owner of ${organisation.name}. You keep your role but lose the owner's rights.`}
          confirmLabel="Transfer"
          onConfirm={() => handleTransfer(picked.id, picked.name)}
          onClose={() => setIsConfirming(false)}
        />
      )}
    </SettingsFrame>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { useAppDispatch, useAppSelector, useCapability } from '../../hooks';
import { fetchMe, updateOrganisation } from '../../features/auth/authSlice';
import type { GlobalAttributeKey } from '../../features/auth/authSlice';
import { ORGANIZATION_ATTRIBUTES } from './organizationAttributes';
import { INPUT, INVALID, QUIET, Select, SettingsNote, SettingsRow, SettingsSave, SettingsSection, FORM_ALERT } from '../../components/ui';

const CONCEPTS: { key: GlobalAttributeKey; label: string; hint: string }[] = [
  { key: 'arr', label: 'Organization ARR', hint: 'The field every ARR figure reads.' },
  { key: 'mrr', label: 'Organization MRR', hint: 'The field monthly figures derive from.' },
  { key: 'renewal_date', label: 'Renewal date', hint: 'The date renewals and the forecast key on.' },
  { key: 'joined_date', label: 'Joined date', hint: 'When the customer started with you.' },
];

const displayName = (field: string) =>
  ORGANIZATION_ATTRIBUTES.find((a) => a.name === field)?.displayName ?? field;

/**
 * Global configuration (settings spec 2026-10-06 §3.3; UI foundations spec §6.3): a section of rows, no longer a side rail.
 * The organisation's name, and which organization attribute
 * stands for each headline concept (ARR, MRR, renewal date, joined date)
 * across the organisation, read from and saved to the backend's
 * organisation settings. Anyone may read; changing needs
 * manage_org_settings, the same capability as Currency.
 */
export function GlobalConfigSection() {
  const dispatch = useAppDispatch();
  const canManage = useCapability('manage_org_settings');
  const organisation = useAppSelector((s) => s.auth.user?.organisation ?? null);
  // Unsaved edits sit on top of what the server has, so the card follows the
  // organisation as the server knows it without copying it into state;
  // Reset simply drops the edits.
  const [edits, setEdits] = useState<{ name?: string; mapping: Partial<Record<GlobalAttributeKey, string>> }>({ mapping: {} });
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  // The organisation in the store is a login-time snapshot; the card reads
  // the mapping and its choices fresh from the server when it opens.
  useEffect(() => {
    dispatch(fetchMe());
  }, [dispatch]);

  const serverMapping: Record<GlobalAttributeKey, string> = { arr: '', mrr: '', renewal_date: '', joined_date: '', ...(organisation?.global_attributes ?? {}) };
  const name = edits.name ?? organisation?.name ?? '';
  const mapping: Record<GlobalAttributeKey, string> = { ...serverMapping, ...edits.mapping };
  const setName = (value: string) => {
    setStatus('idle');
    setEdits((e) => ({ ...e, name: value }));
  };
  const setMapping = (next: Record<GlobalAttributeKey, string>) => {
    setStatus('idle');
    setEdits((e) => ({ ...e, mapping: next }));
  };
  const resetFromServer = () => setEdits({ mapping: {} });

  const dirty =
    !!organisation &&
    (name !== organisation.name || CONCEPTS.some((c) => serverMapping[c.key] !== mapping[c.key]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!organisation || !dirty) return;
    setStatus('saving');
    setError(null);
    const result = await dispatch(updateOrganisation({ name: name.trim(), global_attributes: mapping }));
    if (updateOrganisation.fulfilled.match(result)) {
      setEdits({ mapping: {} });
      setStatus('saved');
    } else {
      setStatus('idle');
      setError(typeof result.payload === 'string' ? result.payload : 'Could not save the configuration.');
    }
  }

  const choices = organisation?.global_attribute_choices;

  return (
    <form onSubmit={submit} aria-label="Global configuration">
      <SettingsSection
        title="Global configuration"
        description={
          canManage ? (
            'These choices apply across the whole organisation: every screen that shows ARR, MRR, a renewal or a joined date reads the field chosen here.'
          ) : (
            <SettingsNote icon="lock">Read-only: changing these needs organisation settings access.</SettingsNote>
          )
        }
        action={
          canManage && dirty ? (
            <button type="button" onClick={resetFromServer} className={QUIET}>
              Reset
            </button>
          ) : undefined
        }
        footer={canManage ? <SettingsSave dirty={dirty} saving={status === 'saving'} status={status === 'saved' ? 'Saved.' : ''} /> : undefined}
      >
        <SettingsRow label="Organization name" htmlFor="org-name" hint="Required." hintId="org-name-hint">
          <input id="org-name" value={name} onChange={(event) => setName(event.target.value)} disabled={!canManage} required aria-describedby="org-name-hint" className={`${INPUT} ${INVALID}`} />
        </SettingsRow>
        {CONCEPTS.map((concept) => (
          <SettingsRow key={concept.key} label={concept.label} htmlFor={`global-${concept.key}`} hint={concept.hint} hintId={`global-${concept.key}-hint`}>
            <Select
              id={`global-${concept.key}`}
              label={concept.label}
              labelPosition="external"
              value={mapping[concept.key]}
              disabled={!canManage}
              describedBy={`global-${concept.key}-hint`}
              onChange={(value) => setMapping({ ...mapping, [concept.key]: value })}
              options={(choices?.[concept.key] ?? [mapping[concept.key]]).map((field) => ({ value: field, label: displayName(field) }))}
            />
          </SettingsRow>
        ))}
        {error ? (
          <p role="alert" className={`px-4 py-3 ${FORM_ALERT}`}>
            {error}
          </p>
        ) : null}
      </SettingsSection>
    </form>
  );
}

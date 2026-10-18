import { useState } from 'react';
import { useAppDispatch, useAppSelector, useCapability } from '../../hooks';
import { updateOrganisation } from '../../features/auth/authSlice';
import { LIFECYCLE_LABELS } from '../../features/customers/formatters';
import { ApiError } from '../../lib/apiClient';
import { Select, SettingsRow, SettingsSection, useInstantSave } from '../../components/ui';
import type { LifecycleCategory } from '../../components/organizations/tableData';

// Settings › Data › Defaults › New organisations (DefaultsPage.tsx). Real,
// admin-gated persistence via Organisation.default_lifecycle_stage: the
// standalone Add Organization flow (ActionBar.tsx) reads this to pre-fill
// new organizations' own Lifecycle Stage instead of always hardcoding
// "Onboarding".
const STAGE_OPTIONS: LifecycleCategory[] = [
  'onboarding', 'kickoff', 'adoption', 'live', 'renewal', 'expansion', 'churn', 'other',
];

export function LifecycleDefaultSection() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const isAdmin = useCapability('manage_org_settings');
  const savedStage = user?.organisation.default_lifecycle_stage ?? '';
  const [error, setError] = useState<string | null>(null);
  const instant = useInstantSave();
  const send = (stage: string) => dispatch(updateOrganisation({ default_lifecycle_stage: stage })).unwrap();
  const readError = (err: unknown) => setError(typeof err === 'string' ? err : err instanceof ApiError ? err.message : 'Could not save.');

  // Saves the moment it is chosen; the store holds the value, so the select
  // keeps the old one until the server answers and Undo sends it back.
  const change = (stage: string) => {
    if (stage === savedStage) return;
    const previous = savedStage;
    setError(null);
    void instant.run({ key: 'stage', request: () => send(stage), onSaved: () => {}, undo: () => send(previous), onError: readError });
  };

  return (
    <SettingsSection title="New organisations" description="Applied when a new organisation is created; you can still change it on each one.">
      <SettingsRow
        label="Default lifecycle stage"
        htmlFor="default-stage-select"
        hint="A new organisation starts here. With no default it starts at Onboarding. Any organisation can still start at another stage."
        hintId="default-stage-hint"
        error={error ?? undefined}
        errorId="default-stage-error"
      >
        <Select
          id="default-stage-select"
          label="Default lifecycle stage"
          labelPosition="external"
          value={savedStage}
          disabled={!isAdmin}
          invalid={Boolean(error)}
          describedBy={error ? 'default-stage-hint default-stage-error' : 'default-stage-hint'}
          onChange={change}
          options={[{ value: '', label: 'No default' }, ...STAGE_OPTIONS.map((stage) => ({ value: stage, label: LIFECYCLE_LABELS[stage] }))]}
          className="sm:max-w-sm"
        />
      </SettingsRow>
    </SettingsSection>
  );
}

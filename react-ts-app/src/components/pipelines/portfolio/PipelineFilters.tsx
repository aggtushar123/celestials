import { useId, useRef, type RefObject } from 'react';
import { toggleIn } from '../../../features/organizations/portfolioParams';
import {
  NO_DEPARTMENT,
  PRIORITY_CHOICES,
  pipelineGroupOptions,
  pipelineSortOptions,
  type PipelineKind,
} from '../../../features/pipelines/pipelineKinds';
import {
  defaultStages,
  type DateFilter,
  type PipelineGroupKey,
  type PipelineParams,
  type PipelineView,
} from '../../../features/pipelines/pipelineParams';
import type { PipelineFilterOptions } from '../../../features/pipelines/pipelineTypes';
import { TYPE } from '../../ui';
import { Check, FILTER_SELECT, FilterGroup, FilterSheet, FilterSheetFooter, GroupSortFields, Radio } from '../../organizations/portfolio/filterParts';

/** Group and sort with the kind's own choices; the Board offers no "None". */
export function PipelineGroupSort({
  kind,
  view,
  params,
  update,
}: {
  kind: PipelineKind;
  view: PipelineView;
  params: PipelineParams;
  update: (patch: Partial<PipelineParams>) => void;
}) {
  return (
    <GroupSortFields
      group={params.group || 'none'}
      sort={params.sort}
      groupOptions={pipelineGroupOptions(kind, view === 'board')}
      sortOptions={pipelineSortOptions(kind)}
      onGroup={(value) => update({ group: value === 'none' ? '' : (value as PipelineGroupKey) })}
      onSort={(sort) => update({ sort })}
    />
  );
}

/** Every filter from spec §1, applied at once (they write the URL), in the
 *  shared Filters frame: a popover from `sm`, a bottom sheet below it that
 *  also holds group, sort, Export and Add. The stage checkboxes show the
 *  view's default stages checked when the URL names none (List: open,
 *  Board: all; plan Decision 6); a choice equal to the default writes none. */
export function PipelineFilters({
  kind,
  view,
  params,
  update,
  options,
  isSm,
  onClose,
  onExport,
  exporting,
  onAdd,
  triggerRef,
}: {
  kind: PipelineKind;
  view: PipelineView;
  params: PipelineParams;
  update: (patch: Partial<PipelineParams>) => void;
  options: PipelineFilterOptions | null;
  isSm: boolean;
  onClose: () => void;
  onExport: () => void;
  exporting: boolean;
  onAdd: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  const ownerRef = useRef<HTMLSelectElement>(null);
  const ownerId = useId();
  const defaults = defaultStages(kind, view);
  const chosen = params.stage.length ? params.stage : defaults;
  const toggleStage = (value: string) => {
    const next = toggleIn(chosen, value);
    const isDefault = next.length === 0 || (next.length === defaults.length && next.every((stage) => defaults.includes(stage)));
    update({ stage: isDefault ? [] : kind.stages.map((stage) => stage.value).filter((stage) => next.includes(stage)) });
  };
  const dates: { value: DateFilter; label: string }[] = [
    { value: '', label: 'Any time' },
    { value: '30', label: 'Within 30 days' },
    { value: '90', label: 'Within 90 days' },
    { value: '180', label: 'Within 180 days' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'none', label: 'No date' },
  ];

  return (
    <FilterSheet isSm={isSm} onClose={onClose} triggerRef={triggerRef} initialFocusRef={ownerRef}>
      {!isSm ? (
        <div className="flex flex-wrap items-center gap-3">
          <PipelineGroupSort kind={kind} view={view} params={params} update={update} />
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor={ownerId} className={TYPE.label}>
          Owner
        </label>
        {/* A bare select: the sheet focuses it by ref (as Records' FiltersPanel does). The server's options already include "Not in your book" and Unassigned. */}
        <select ref={ownerRef} id={ownerId} className={FILTER_SELECT} value={params.owner} onChange={(event) => update({ owner: event.target.value })}>
          <option value="">Everyone</option>
          {(options?.owners ?? []).map((owner) => (
            <option key={owner.value} value={owner.value}>
              {owner.name}
            </option>
          ))}
        </select>
      </div>

      <FilterGroup legend="Organization">
        {options?.organisations.length ? (
          options.organisations.map((organisation) => (
            <Check
              key={organisation.value}
              label={organisation.name}
              checked={params.organisation.includes(organisation.value)}
              onChange={() => update({ organisation: toggleIn(params.organisation, organisation.value) })}
            />
          ))
        ) : (
          <p className={TYPE.bodyMuted}>No organizations to filter by yet.</p>
        )}
      </FilterGroup>

      <FilterGroup legend="Account">
        {options?.accounts.length ? (
          options.accounts.map((account) => (
            <Check
              key={account.value}
              label={account.name}
              checked={params.account.includes(account.value)}
              onChange={() => update({ account: toggleIn(params.account, account.value) })}
            />
          ))
        ) : (
          <p className={TYPE.bodyMuted}>No accounts to filter by yet.</p>
        )}
      </FilterGroup>

      <FilterGroup legend="Stage">
        {kind.stages.map((stage) => (
          <Check key={stage.value} label={stage.label} checked={chosen.includes(stage.value)} onChange={() => toggleStage(stage.value)} />
        ))}
      </FilterGroup>

      <FilterGroup legend="Priority">
        {PRIORITY_CHOICES.map((priority) => (
          <Check
            key={priority.value}
            label={priority.name}
            checked={params.priority.includes(priority.value)}
            onChange={() => update({ priority: toggleIn(params.priority, priority.value) })}
          />
        ))}
      </FilterGroup>

      <FilterGroup legend="Department">
        {(options?.departments ?? []).map((department) => (
          <Check
            key={department.value}
            label={department.value === NO_DEPARTMENT ? 'Whole company' : department.name}
            checked={params.department.includes(department.value)}
            onChange={() => update({ department: toggleIn(params.department, department.value) })}
          />
        ))}
      </FilterGroup>

      <FilterGroup legend={kind.dateVerb}>
        {dates.map((date) => (
          <Radio key={date.label} name="pipeline-date" label={date.label} checked={params.date === date.value} onChange={() => update({ date: date.value })} />
        ))}
      </FilterGroup>

      {!isSm ? <FilterSheetFooter onExport={onExport} exporting={exporting} onAdd={onAdd} addLabel={`Add ${kind.noun.one}`} /> : null}
    </FilterSheet>
  );
}

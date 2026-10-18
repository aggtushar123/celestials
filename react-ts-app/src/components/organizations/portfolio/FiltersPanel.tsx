import { useId, useRef, type RefObject } from 'react';
import { HEALTH_BANDS, toggleIn, type PortfolioParams } from '../../../features/organizations/portfolioParams';
import { HEALTH_LABEL, NPS_BANDS, NPS_LABEL, RENEWAL_WINDOWS, windowLabel } from '../../../features/organizations/portfolioLabels';
import type { FilterOptions, GroupKey, LifecycleValue, NpsBand } from '../../../features/organizations/portfolioTypes';
import type { GroupOption } from '../../../features/organizations/portfolioGroups';
import { Check, FILTER_SELECT, FilterGroup, FilterSheet, FilterSheetFooter, GroupSortFields, Radio } from './filterParts';
import { TYPE } from '../../ui';
import { usePortfolioKind } from './portfolioKind';

// Kept importable from here, where the pages and tests already find them.
export { BOARD_GROUP_OPTIONS, GROUP_OPTIONS, type GroupOption } from '../../../features/organizations/portfolioGroups';

/** Group and sort: in the toolbar from `sm`, inside the Filters sheet below. */
export function GroupSortControls({
  params,
  update,
  groupOptions,
}: {
  params: PortfolioParams;
  update: (patch: Partial<PortfolioParams>) => void;
  /** The Board passes its kind's board options; absent, the kind's List options. */
  groupOptions?: GroupOption[];
}) {
  const kind = usePortfolioKind();
  return (
    <GroupSortFields
      group={params.group || 'none'}
      sort={params.sort}
      groupOptions={groupOptions ?? kind.groupOptions}
      sortOptions={kind.sortOptions}
      onGroup={(value) => update({ group: value === 'none' ? '' : (value as GroupKey) })}
      onSort={(sort) => update({ sort })}
    />
  );
}

const WINDOWS: { value: PortfolioParams['renews_within']; label: string }[] = [
  { value: '', label: 'Any time' },
  ...RENEWAL_WINDOWS.map((days) => ({ value: days, label: windowLabel(days) })),
];
const NPS: { value: '' | NpsBand; label: string }[] = [
  { value: '', label: 'Any' },
  ...NPS_BANDS.map((band) => ({ value: band, label: NPS_LABEL[band] })),
];

/** Every filter from spec §1. Changes apply at once (they write the URL).
 *  From `sm` it is a popover under the toolbar. Below `sm` it is a modal
 *  bottom sheet that also holds group, sort, Export and Add, because the
 *  phone toolbar is only Search and Filters. */
export function FiltersPanel({
  params,
  update,
  options,
  isSm,
  onClose,
  onExport,
  exporting,
  onAdd,
  triggerRef,
  groupOptions,
}: {
  params: PortfolioParams;
  update: (patch: Partial<PortfolioParams>) => void;
  options: FilterOptions | null;
  isSm: boolean;
  onClose: () => void;
  onExport: () => void;
  exporting: boolean;
  onAdd: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
  /** The phone sheet's Group choices (the Board passes BOARD_GROUP_OPTIONS). */
  groupOptions?: GroupOption[];
}) {
  const kind = usePortfolioKind();
  const ownerRef = useRef<HTMLSelectElement>(null);
  const ownerId = useId();

  return (
    <FilterSheet isSm={isSm} onClose={onClose} triggerRef={triggerRef} initialFocusRef={ownerRef}>
      {!isSm ? (
        <div className="flex flex-wrap items-center gap-3">
          <GroupSortControls params={params} update={update} groupOptions={groupOptions} />
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor={ownerId} className={TYPE.label}>
          Owner
        </label>
        {/* The server's options already include Unassigned. */}
        {/* A bare select, not Select: the sheet focuses it on open by ref. */}
        <select ref={ownerRef} id={ownerId} className={FILTER_SELECT} value={params.owner} onChange={(event) => update({ owner: event.target.value })}>
          <option value="">Everyone</option>
          {(options?.owners ?? []).map((owner) => (
            <option key={owner.value} value={owner.value}>
              {owner.name}
            </option>
          ))}
        </select>
      </div>

      {kind.filters.organisation ? (
        <FilterGroup legend="Organization">
          {options?.organisations?.length ? (
            options.organisations.map((organisation) => (
              <Check
                key={organisation.value}
                label={organisation.name}
                checked={(params.organisation ?? []).includes(organisation.value)}
                onChange={() => update({ organisation: toggleIn(params.organisation ?? [], organisation.value) })}
              />
            ))
          ) : (
            <p className={TYPE.bodyMuted}>No organizations to filter by yet.</p>
          )}
        </FilterGroup>
      ) : null}

      <FilterGroup legend="Health">
        {HEALTH_BANDS.map((band) => (
          <Check key={band} label={HEALTH_LABEL[band]} checked={params.health.includes(band)} onChange={() => update({ health: toggleIn(params.health, band) })} />
        ))}
      </FilterGroup>

      <FilterGroup legend="Lifecycle">
        {(options?.lifecycles ?? []).map((stage) => (
          <Check
            key={stage.value}
            label={stage.name}
            checked={params.lifecycle.includes(stage.value as LifecycleValue)}
            onChange={() => update({ lifecycle: toggleIn(params.lifecycle, stage.value as LifecycleValue) })}
          />
        ))}
      </FilterGroup>

      {kind.filters.product ? (
        <FilterGroup legend="Product">
          {options?.products?.length ? (
            options.products.map((product) => (
              <Check key={product.value} label={product.name} checked={params.product.includes(product.value)} onChange={() => update({ product: toggleIn(params.product, product.value) })} />
            ))
          ) : (
            <p className={TYPE.bodyMuted}>No products in the catalogue yet.</p>
          )}
        </FilterGroup>
      ) : null}

      <FilterGroup legend="Renews within">
        {WINDOWS.map((w) => (
          <Radio key={w.label} name="renews_within" label={w.label} checked={params.renews_within === w.value} onChange={() => update({ renews_within: w.value })} />
        ))}
      </FilterGroup>

      <FilterGroup legend="NPS">
        {NPS.map((n) => (
          <Radio key={n.label} name="nps" label={n.label} checked={params.nps === n.value} onChange={() => update({ nps: n.value })} />
        ))}
      </FilterGroup>

      {kind.filters.churned ? (
        <FilterGroup legend="Churned">
          <Check label="Include churned" checked={params.include_churned} onChange={() => update({ include_churned: !params.include_churned })} />
        </FilterGroup>
      ) : null}

      {!isSm ? <FilterSheetFooter onExport={onExport} exporting={exporting} onAdd={onAdd} addLabel={`Add ${kind.noun.one}`} /> : null}
    </FilterSheet>
  );
}

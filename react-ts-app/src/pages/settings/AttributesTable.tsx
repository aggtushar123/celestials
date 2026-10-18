import { useState } from 'react';
import { Badge, CODE, ListHeaderRow, ListRow, MetaParts, NUM, QUIET, SettingsSection, TYPE } from '../../components/ui';
import { ATTRIBUTE_TYPE_LABELS, usagePercent, type AttributeDef } from './attributeConfig';
import { ATTRIBUTE_GRID } from './attributeGrid';

/** Rows shown before "Show all" (spec §4.1: a list over about 20 rows ends
 *  in Show all inside its card, never a fixed height). */
const PAGE = 20;

export interface AttributesTableProps<T> {
  /** Every record of this entity currently loaded: Filled is computed from these, never fabricated. */
  entities: T[];
  /** Already filtered by the search and the Filter: split into Custom and System here. */
  attributes: AttributeDef<T>[];
}

/** An entity's attributes (settings spec 2026-10-06 §3.3; UI foundations
 *  spec §4.2, §9.2 row 4): Custom, then System, each one card of rows on
 *  the attribute grid. Only Required is a badge, in the neutral tone:
 *  every row is visible, and "UI editable" is what Custom already says. */
export function AttributesTable<T>({ entities, attributes }: AttributesTableProps<T>) {
  return (
    <>
      <AttributeSection title="Custom attributes" attributes={attributes.filter((attr) => attr.isCustom)} entities={entities} />
      <AttributeSection title="System attributes" attributes={attributes.filter((attr) => !attr.isCustom)} entities={entities} />
    </>
  );
}

function AttributeSection<T>({ title, attributes, entities }: { title: string; attributes: AttributeDef<T>[]; entities: T[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? attributes : attributes.slice(0, PAGE);
  return (
    <SettingsSection
      title={title}
      action={<span className={`${TYPE.meta} ${NUM}`}>{attributes.length}</span>}
      list={title}
      header={<ListHeaderRow columns={ATTRIBUTE_GRID.columns} labels={ATTRIBUTE_GRID.labels} align={ATTRIBUTE_GRID.aligns} show={ATTRIBUTE_GRID.headerShow} />}
      state={attributes.length === 0 ? <p className={`px-4 py-3 ${TYPE.bodyMuted}`}>None here.</p> : undefined}
      footer={
        attributes.length > PAGE && !showAll ? (
          <button type="button" onClick={() => setShowAll(true)} className={QUIET}>
            Show all {attributes.length}
          </button>
        ) : undefined
      }
    >
      {shown.map((attr) => {
        const usage = usagePercent(attr, entities);
        const type = ATTRIBUTE_TYPE_LABELS[attr.type];
        return (
          <ListRow
            key={attr.name}
            dataAttrs={{ 'data-attribute': attr.name }}
            title={attr.displayName}
            columns={ATTRIBUTE_GRID.columns}
            gridAt={ATTRIBUTE_GRID.gridAt}
            meta={
              <>
                {/* Trailing dots (MetaParts): the name's dot shows only with the parts after it. */}
                <span>
                  <span className={CODE}>{attr.name}</span>
                  <span className={ATTRIBUTE_GRID.narrowOnly}> ·</span>
                </span>{' '}
                <span className={ATTRIBUTE_GRID.narrowOnly}>
                  <MetaParts parts={[type, attr.required ? 'Required' : null, `${usage}% filled`]} />
                </span>
              </>
            }
            cells={[
              <span key="type" className={TYPE.body}>
                {type}
              </span>,
              <span key="required">{attr.required ? <Badge>Required</Badge> : null}</span>,
              <span key="filled" className="flex items-center justify-end gap-2">
                <span aria-hidden="true" className="h-1 w-12 overflow-hidden rounded-full bg-subtle">
                  <span className="block h-full rounded-full bg-ink-muted" style={{ width: `${usage}%` }} />
                </span>
                <span className={`${TYPE.body} ${NUM}`}>{usage}%</span>
              </span>,
            ]}
          />
        );
      })}
    </SettingsSection>
  );
}

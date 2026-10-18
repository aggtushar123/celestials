import { lastRunParts, ruleParts } from '../../features/rules/ruleText';
import type { Rule, RuleRow } from '../../features/rules/ruleTypes';
import { sentenceText } from '../../features/segments/ruleSentence';
import { Badge, ListRow, TYPE } from '../ui';
import { Parts } from './Parts';
import { RULE_GRID } from './ruleGrid';
import { RuleSwitch } from './RuleSwitch';

const SHARING = { private: null, workspace: 'Workspace', people: 'Shared' } as const;

/** One rule (spec §2.1; UI foundations spec §4.2): the name opens it, the
 *  rule as one sentence is its meta line; the last night and whose it is
 *  sit in the rules grid's middle column from a 44rem list (leading the
 *  meta line below it, so truncation never hides them); Paused, then the owner's switch or a reader's On / Off,
 *  is the one always-visible control. */
export function RuleListItem({ row, onChange }: { row: RuleRow; onChange: (rule: Rule) => void }) {
  const sharing = SHARING[row.sharing];
  const lastRun = (
    <>
      <Parts parts={lastRunParts(row.last_run)} /> · {row.is_owner ? 'You' : row.owner.name}
      {sharing ? ` · ${sharing}` : ''}
    </>
  );
  return (
    <ListRow
      dataAttrs={{ 'data-rule': row.id }}
      title={row.name}
      href={`/scenarios/rules/${row.id}`}
      columns={RULE_GRID.columns}
      gridAt={RULE_GRID.gridAt}
      meta={
        <>
          <span data-part="last-run-narrow" className={RULE_GRID.narrowOnly}>
            {lastRun} ·{' '}
          </span>
          {sentenceText(ruleParts(row, row.segment))}
        </>
      }
      cells={[
        <p key="last-run" data-part="last-run" className={`truncate ${TYPE.bodyMuted}`}>
          {lastRun}
        </p>,
      ]}
      trailing={
        <>
          {row.paused_reason ? <Badge>Paused</Badge> : null}
          {row.is_owner ? (
            <RuleSwitch rule={row} onChange={onChange} />
          ) : (
            <p data-part="status" className={TYPE.bodyMuted}>
              {row.is_active ? 'On' : 'Off'}
            </p>
          )}
        </>
      }
    />
  );
}

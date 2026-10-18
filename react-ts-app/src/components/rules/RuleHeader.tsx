import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Pencil } from 'lucide-react';
import { deleteRule } from '../../features/rules/ruleApi';
import { pausedText, ruleParts, sharingText } from '../../features/rules/ruleText';
import type { Rule } from '../../features/rules/ruleTypes';
import { MadeByLine } from '../agents/MadeByLine';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { RuleSentence } from '../segments/RuleSentence';
import { DetailHeader, NUM, TYPE } from '../ui';
import { RuleSwitch } from './RuleSwitch';

/** The rule's header (spec §2.3): its name, the rule as a sentence, whose
 *  it is, its sharing and its wait; the owner's switch, Edit and Delete
 *  (plan Decision 14); a paused notice when it switched itself off. */
export function RuleHeader({ rule, onReplace }: { rule: Rule; onReplace: (rule: Rule) => void }) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const paused = pausedText(rule.paused_reason, rule.paused_message, rule.is_owner);
  return (
    <>
      <DetailHeader
        title={rule.name}
        control={
          rule.is_owner ? (
            <RuleSwitch rule={rule} onChange={onReplace} />
          ) : (
            <p data-part="status" className={TYPE.bodyMuted}>
              {rule.is_active ? 'On' : 'Off'}
            </p>
          )
        }
        actions={rule.is_owner ? [{ key: 'edit', label: 'Edit', icon: Pencil, to: `/scenarios/rules/${rule.id}/edit` }] : []}
        menu={rule.is_owner ? [{ key: 'delete', label: 'Delete', onSelect: () => setDeleting(true), danger: true }] : []}
        meta={
          // One span per part, the dot trailing, so a wrapped phone line never starts with "·";
          // the wait is one span, as the wrapper is a flex row and loose figures would each take a gap;
          // the spaces between keep the text whole for a screen reader (the flex row drops them).
          <>
            <span>{rule.is_owner ? 'Yours' : `Owned by ${rule.owner.name}`} ·</span>{' '}
            <span>{sharingText(rule.sharing, rule.shared_with)} ·</span>{' '}
            <span>
              Once per record every <span className={NUM}>{rule.cooldown_days}</span> days
            </span>
          </>
        }
        status={
          paused ? (
            <p data-part="paused" className={`flex items-start gap-2 ${TYPE.body}`}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              {paused}
            </p>
          ) : null
        }
      >
        <div data-part="sentence">
          <RuleSentence parts={ruleParts(rule, rule.segment)} />
        </div>
        <MadeByLine madeBy={rule.made_by} />
      </DetailHeader>
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${rule.name}?`}
          message="Its nights and any surveys waiting for your review are deleted. Nothing it has already done is undone."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            try {
              await deleteRule(rule.id);
            } catch (err) {
              // ConfirmDialog shows a thrown string as its error.
              throw errorMessage(err, 'Could not delete this rule.');
            }
            navigate('/scenarios');
          }}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </>
  );
}

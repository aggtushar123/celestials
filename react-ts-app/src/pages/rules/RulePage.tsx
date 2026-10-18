import { useState } from 'react';
import { Outlet, useParams, useSearchParams } from 'react-router-dom';
import { openRun } from '../../features/rules/ruleParams';
import type { Rule } from '../../features/rules/ruleTypes';
import { NightsSection } from '../../components/rules/NightsSection';
import { RuleHeader } from '../../components/rules/RuleHeader';
import { RuleFailed, RuleLoading, RuleMissing } from '../../components/rules/RuleStates';
import { useRule } from '../../components/rules/useRule';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { PageHeader } from '../../components/ui';

const BACK = { to: '/scenarios', label: 'Scenarios' } as const;

/** What the rule page hands its `edit` child route: the rule it has read,
 *  and how to swap in the saved copy. */
export interface RuleOutlet {
  rule: Rule;
  onReplace: (rule: Rule) => void;
}

/** /scenarios/rules/:id (spec §2.3). */
export function RulePage() {
  const { id } = useParams();
  if (!id || !/^\d+$/.test(id)) {
    return (
      <OrganizationsFrame>
        <PageHeader back={BACK} title="Rule" />
        <RuleMissing />
      </OrganizationsFrame>
    );
  }
  return <LoadedRule key={id} id={Number(id)} />;
}

function LoadedRule({ id }: { id: number }) {
  const [load, replace, retry] = useRule(id);
  if (load.status === 'ready') return <RuleView rule={load.rule} onReplace={replace} />;
  return (
    <OrganizationsFrame>
      <PageHeader back={BACK} title="Rule" />
      {load.status === 'loading' ? <RuleLoading /> : null}
      {load.status === 'missing' ? <RuleMissing /> : null}
      {load.status === 'failed' ? <RuleFailed message={load.message} onRetry={retry} /> : null}
    </OrganizationsFrame>
  );
}

function RuleView({ rule, onReplace }: { rule: Rule; onReplace: (rule: Rule) => void }) {
  const [search] = useSearchParams();
  // Only the first load opens the linked night; later URL changes do not.
  const [firstRun] = useState(() => openRun(search));
  // An edit can expire the night's waiting survey, so after a save the
  // nights read again; the header's switch leaves them be.
  const [edits, setEdits] = useState(0);
  const onSaved = (saved: Rule) => {
    onReplace(saved);
    setEdits((n) => n + 1);
  };
  return (
    <OrganizationsFrame>
      <PageHeader back={BACK} />
      <div className="flex flex-col gap-4 pb-6">
        <RuleHeader rule={rule} onReplace={onReplace} />
        <NightsSection key={edits} rule={rule} openRun={firstRun} />
      </div>
      {/* /scenarios/rules/:id/edit: the builder modal over this page. */}
      <Outlet context={{ rule, onReplace: onSaved } satisfies RuleOutlet} />
    </OrganizationsFrame>
  );
}

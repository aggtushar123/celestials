import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { BrainControls } from '../../components/brain/BrainControls';
import { BrainFrame } from '../../components/brain/BrainFrame';
import { DoingPlanRow } from '../../components/brain/DoingPlanRow';
import { DoingRuleRow } from '../../components/brain/DoingRuleRow';
import { DoingSkeleton } from '../../components/brain/DoingSkeleton';
import { DoingTiles } from '../../components/brain/DoingTiles';
import { InitiativeForm } from '../../components/brain/InitiativeForm';
import { InitiativeRow } from '../../components/brain/InitiativeRow';
import { KnowledgeByFunctionPanel } from '../../components/brain/KnowledgeByFunctionPanel';
import { LostAccessNotice } from '../../components/brain/LostAccessNotice';
import { useBrainScope } from '../../components/brain/useBrainScope';
import { useDoing } from '../../components/brain/useDoing';
import { Card, EmptyState, ErrorState as UiErrorState, FOCUS, ListCard, LoadingState, PRIMARY, TYPE } from '../../components/ui';
import { SAY } from '../../features/brain/brainText';
import type { ScopeKey } from '../../features/brain/brainTypes';
import { canStart, DO, hiddenPlansText, initiativesEmpty, sectionOf, type SectionKey } from '../../features/brain/doingText';
import { useAppSelector, useCapability } from '../../hooks';
import { useReportBrainScope } from './ask/brainScopeReport';

const headingId = (key: SectionKey) => `doing-${key}`;

function Section({ id, title, action, children }: { id: SectionKey; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={headingId(id)} data-section={id} className="flex flex-col gap-3">
      {/* Fix wave item 3: a steady min height so Initiatives' row with New
          initiative lines up with any plain section header beside it. */}
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        <h2 id={headingId(id)} tabIndex={-1} className={`${TYPE.title} ${FOCUS}`}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** /brain/doing: What's being done (spec 2026-10-05-brain-doing-design
 *  §2.1), for every member, scoped Me · My team · Company: the initiatives,
 *  plans and rules at work on the scope's book, and in Company, Knowledge
 *  by function. */
export function DoingPage() {
  const brain = useBrainScope();
  useReportBrainScope(brain.scope, brain.error !== null);
  const scope = brain.scope;
  const doing = useDoing(scope, brain.refused);
  const data = doing.data;
  const canSeeAll = useCapability('view_all_accounts');
  const user = useAppSelector((state) => state.auth.user);
  const reader = user ? { id: user.id, name: user.name } : null;
  const [params] = useSearchParams();
  const section = sectionOf(params.get('section'));
  const [forming, setForming] = useState<ScopeKey | null>(null);
  const [status, setStatus] = useState<{ scope: ScopeKey; text: string } | null>(null);
  const newRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<number | 'NEW' | null>(null);
  const landed = useRef<SectionKey | null>(null);

  // Plan Decision 2: a section named in the URL takes focus once the work is here.
  useEffect(() => {
    if (!data || !section || landed.current === section) return;
    landed.current = section;
    const heading = document.getElementById(headingId(section));
    heading?.focus();
    heading?.scrollIntoView?.({ block: 'start' });
  }, [data, section]);

  // Plan Decision 5: after a start, the new row's first control; after Cancel, New initiative.
  // `useDoing` now keeps the previous payload on screen while the post-start
  // re-read is in flight (minor fix, final review), so `data` is truthy even
  // before the new row exists; wait for the row itself, not merely for data.
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    if (target === 'NEW') {
      pendingFocus.current = null;
      newRef.current?.focus();
      return;
    }
    if (!data) return;
    const row = document.querySelector(`[data-initiative="${target}"]`);
    if (!row) return;
    pendingFocus.current = null;
    (row.querySelector<HTMLElement>('button, a[href]') ?? newRef.current)?.focus();
  }, [data, forming]);

  const showForm = scope !== null && forming === scope;

  function closeForm() {
    pendingFocus.current = 'NEW';
    setForming(null);
  }

  function started(id: number) {
    pendingFocus.current = id;
    setForming(null);
    if (scope) setStatus({ scope, text: DO.STARTED });
    doing.retry();
  }

  let body: ReactNode;
  if (brain.error) body = (
      <Card pad="none">
        <UiErrorState message={brain.error} onRetry={brain.retry} />
      </Card>
    );
  else if (doing.error) body = (
      <Card pad="none">
        <UiErrorState message={doing.error} onRetry={doing.retry} />
      </Card>
    );
  else if (!scope || !data || !reader) body = <DoingSkeleton />;
  else {
    const hidden = hiddenPlansText(data.hidden);
    const newButton = canStart(scope, canSeeAll) ? (
      <button ref={newRef} type="button" aria-expanded={showForm} onClick={() => (showForm ? closeForm() : setForming(scope))} className={PRIMARY}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {DO.NEW}
      </button>
    ) : null;
    body = (
      <>
        <Section id="initiatives" title={DO.INITIATIVES} action={newButton}>
          {showForm ? (
            scope === 'company' ? (
              <InitiativeForm mode="company" onSaved={started} onCancel={closeForm} />
            ) : (
              <InitiativeForm mode="book" scope={scope} reader={reader} trackable={data.trackable} onSaved={started} onCancel={closeForm} />
            )
          ) : null}
          <ListCard label={DO.INITIATIVES} state={data.initiatives.length === 0 ? <EmptyState size="inline" title={initiativesEmpty(scope)} /> : undefined}>
            {data.initiatives.map((one) => (
              <InitiativeRow key={one.id} initiative={one} readerId={reader.id} currency={data.currency} onChanged={doing.replace} />
            ))}
          </ListCard>
        </Section>
        <Section id="plans" title={DO.PLANS}>
          <ListCard label={DO.PLANS} state={data.plans.length === 0 ? <EmptyState size="inline" title={DO.NO_PLANS} /> : undefined}>
            {data.plans.map((plan) => (
              <DoingPlanRow key={plan.id} plan={plan} currency={data.currency} />
            ))}
          </ListCard>
          {hidden ? (
            <p data-part="hidden" className={TYPE.bodyMuted}>
              {hidden}
            </p>
          ) : null}
        </Section>
        <Section id="rules" title={DO.RULES}>
          <ListCard label={DO.RULES} state={data.rules.length === 0 ? <EmptyState size="inline" title={DO.NO_RULES} /> : undefined}>
            {data.rules.map((rule) => (
              <DoingRuleRow key={rule.id} rule={rule} />
            ))}
          </ListCard>
        </Section>
        {scope === 'company' && canSeeAll ? (
          <section aria-label={SAY.KNOWLEDGE}>
            <KnowledgeByFunctionPanel />
          </section>
        ) : null}
      </>
    );
  }

  // The tiles (brain UI spec §2) replace the section links: each sets
  // `?section=` and the effect above moves focus there; on the section
  // already named, it moves focus there again.
  let tiles: ReactNode = null;
  if (!brain.error && !doing.error) {
    tiles =
      scope && data && reader ? (
        <DoingTiles data={data} current={section} onSame={(key) => document.getElementById(headingId(key))?.focus()} />
      ) : (
        <div aria-hidden="true">
          <LoadingState label="Loading the counts" variant="tiles" count={3} />
        </div>
      );
  }

  return (
    <BrainFrame>
      <BrainControls brain={brain} />
      {brain.notice ? <LostAccessNotice message={brain.notice} /> : null}
      {tiles}
      {/* Always mounted; sr-only while empty, so it takes no room. */}
      <p role="status" data-part="doing-status" className={status && status.scope === scope ? TYPE.bodyMuted : 'sr-only'}>
        {status && status.scope === scope ? status.text : ''}
      </p>
      {body}
    </BrainFrame>
  );
}

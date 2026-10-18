import { useEffect, useRef, useState, type ReactNode } from 'react';
import { refusalDetail, runAgent } from '../../features/agents/agentsApi';
import { AGENTS, budgetText, lastRunText, runAnswerText, waitingText } from '../../features/agents/agentsText';
import type { AgentCard as Card } from '../../features/agents/agentTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { Figured } from '../brain/Figured';
import { recommendationsChanged, taskChanged } from '../work/taskChanges';
import { BUTTON, FOCUS, META_DANGER, SettingsSection, TYPE } from '../ui';

/** One agent (spec §1.8; Decision 8): its name, the spend bar, its last run,
 *  Run now for those the contract lets run it, and `children` (the form's
 *  own switch and budget for an admin, the values as text otherwise),
 *  drawn as a SettingsSection (UI foundations spec §6.3): the name is its h2,
 *  Run now its one action. */
export function AgentCard({ card, canRun, onRan, children }: { card: Card; canRun: boolean; onRan: (next: Card) => void; children?: ReactNode }) {
  const [said, setSaid] = useState<{ text: string; failed: boolean } | null>(null);
  const [tick, setTick] = useState(0);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const { busy, run } = useSubmitOnce();
  useEffect(() => {
    if (tick > 0) alertRef.current?.focus();
  }, [tick]);
  const over = card.monthly_credits > 0 && card.spent_this_month >= card.monthly_credits;
  const waiting = waitingText(card);
  const width = card.monthly_credits > 0 ? Math.min(100, Math.round((card.spent_this_month / card.monthly_credits) * 100)) : 0;

  async function runNow() {
    // aria-disabled keeps focus here while it runs, so the press returns early.
    if (busy) return;
    setSaid(null);
    const outcome = await run(() => runAgent(card.kind));
    if (!outcome) return;
    if (outcome.ok) {
      onRan(outcome.value);
      // Its proposals wait on My work and Team: the Work badge reads again
      // (recommendationsChanged). What it applied may have changed tasks.
      recommendationsChanged();
      if ((outcome.value.last_run?.applied ?? 0) > 0) taskChanged();
      setSaid({ text: runAnswerText(outcome.value), failed: false });
    } else {
      setSaid({ text: refusalDetail(outcome.error) ?? errorMessage(outcome.error, AGENTS.RUN_FAILED), failed: true });
      setTick((n) => n + 1);
    }
  }

  return (
    <SettingsSection
      title={card.label}
      action={
        canRun ? (
          <button type="button" aria-disabled={busy || undefined} onClick={() => void runNow()} className={BUTTON}>
            {busy ? AGENTS.RUNNING : AGENTS.RUN}
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-1 px-4 py-3">
        <div
          role="progressbar"
          aria-label={`${card.label} credits this month`}
          aria-valuemin={0}
          aria-valuemax={Math.max(1, card.monthly_credits)}
          aria-valuenow={Math.min(card.spent_this_month, card.monthly_credits)}
          className="h-2 w-full overflow-hidden rounded-full bg-subtle"
        >
          <div className={`h-full ${over ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${width}%` }} />
        </div>
        <p className={TYPE.meta}>
          <Figured text={budgetText(card)} />
        </p>
        {waiting ? (
          <p className={META_DANGER}>
            <Figured text={waiting} />
          </p>
        ) : null}
        <p className={TYPE.meta}>
          <Figured text={lastRunText(card)} />
        </p>
        {/* Always mounted and never display:none (M10, as Waiting's), so the
            success is announced; a failure is its own focused alert. */}
        <p role="status" className={`${TYPE.body} empty:sr-only`}>
          {said && !said.failed ? said.text : null}
        </p>
        {said?.failed ? (
          <p ref={alertRef} tabIndex={-1} role="alert" className={`rounded-sm text-[13px] leading-5 text-danger-ink ${FOCUS}`}>
            {said.text}
          </p>
        ) : null}
      </div>
      {children}
    </SettingsSection>
  );
}

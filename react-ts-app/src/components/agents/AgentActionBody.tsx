import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AGENTS, previewText, scenarioStepsText, taskChangeText } from '../../features/agents/agentsText';
import type { AgentAction } from '../../features/agents/agentTypes';
import { Figured } from '../brain/Figured';
import { evidenceLabel } from '../../features/agents/evidenceLabel';
import { FOCUS, INLINE_TARGET, TYPE } from '../ui';
import { useTaskLink } from '../work/useTaskLink';

// Underlined at rest, so a linked evidence line reads as a link; a plain
// one stays a span.
const EVIDENCE_LINK = `inline-flex items-center text-[13px] leading-5 font-normal text-ink-muted underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink ${INLINE_TARGET} ${FOCUS}`;
const TASK_LINK = `inline-flex items-center font-semibold text-ink hover:underline ${INLINE_TARGET} ${FOCUS}`;

/** What an agent action does and why (spec §1.8; Decision 5; delivery 2 Decision 9): the preview
 *  (a task kind links its task, opening the panel over this page), the
 *  rationale, and the evidence when the server sent it. `preview` replaces
 *  the preview sentence (a bundle step draws its placeholders as chips). */
export function AgentActionBody({ action, preview }: { action: AgentAction; preview?: ReactNode }) {
  const taskLink = useTaskLink();
  // task.create previews stay plain (their sentence does not start with the
  // title); Activity links the made task from its meta line instead. The
  // server sends no id for a task the reader can't open or one removed
  // since, so only a numeric id is a link.
  const task = action.kind === 'task.create' ? null : (action.preview.task ?? null);
  const taskId = task && typeof task.id === 'number' && action.preview.field ? task.id : null;
  // A reply draft or a campaign shows its opening lines; a scenario its
  // trigger and steps (deliveries 2 and 3, Decision 1).
  const excerpt =
    action.kind === 'draft.reply'
      ? action.preview.draft?.excerpt
      : action.kind === 'campaign.create' || action.kind === 'campaign.send'
        ? action.preview.campaign?.excerpt
        : undefined;
  const scenario = action.kind === 'scenario.create' ? action.preview.scenario : undefined;
  return (
    <div className="flex flex-col gap-1">
      <p data-part="preview" className={TYPE.body}>
        {preview !== undefined ? (
          preview
        ) : taskId !== null && task ? (
          <>
            <Link {...taskLink(taskId)} className={TASK_LINK}>
              {task.title}
            </Link>
            {': '}
            <Figured text={taskChangeText(action)} />
          </>
        ) : (
          <Figured text={previewText(action)} />
        )}
      </p>
      {scenario ? (
        <p data-part="steps" className={TYPE.bodyMuted}>
          {scenarioStepsText(scenario)}
        </p>
      ) : null}
      {excerpt ? (
        <blockquote data-part="excerpt" className={`${TYPE.bodyMuted} max-w-[68ch] whitespace-pre-line border-l-2 border-line pl-3`}>
          {excerpt}
        </blockquote>
      ) : null}
      {action.rationale ? (
        <p className={`max-w-[68ch] ${TYPE.bodyMuted}`}>
          <span className="sr-only">{`${AGENTS.WHY}: `}</span>
          {action.rationale}
        </p>
      ) : null}
      {action.evidence.length > 0 ? (
        <ul aria-label={AGENTS.EVIDENCE} className="flex flex-wrap items-center gap-x-3">
          {action.evidence.map((item, index) => (
            <li key={`${index}:${item.link ?? ''}:${item.label}`}>
              {item.link !== null ? (
                <Link to={item.link} className={EVIDENCE_LINK}>
                  <Figured text={evidenceLabel(item.label)} />
                </Link>
              ) : (
                <span className={TYPE.bodyMuted}>
                  <Figured text={evidenceLabel(item.label)} />
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

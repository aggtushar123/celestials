import { Bot } from 'lucide-react';
import { madeByText } from '../../features/agents/agentsText';
import type { MadeBy } from '../../features/agents/agentTypes';

/** "Made by the Ops agent, approved by Alice" (Agents delivery 3, Decision
 *  4): under the owner line of a segment, scenario, campaign, map or plan
 *  template an agent action made. Nothing when a person made it; the
 *  server's `made_by` alone decides. */
export function MadeByLine({ madeBy, className = '' }: { madeBy: MadeBy | null | undefined; className?: string }) {
  if (!madeBy) return null;
  return (
    <p data-part="made-by" className={`flex items-center gap-1.5 text-[11px] text-ink-muted ${className}`}>
      <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {madeByText(madeBy)}
    </p>
  );
}

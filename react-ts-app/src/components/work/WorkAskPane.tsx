import { useState } from 'react';
import { ListTodo, Plus } from 'lucide-react';
import { CopilotRail } from '../copilot/CopilotRail';
import type { Conversation } from '../../pages/copilot/types';
import { QuickAdd } from './QuickAdd';
import { RailCard } from '../copilot/RailCard';
import { ScheduledCard } from './ScheduledCard';
import { todoAdded } from './taskChanges';

/** Work's right pane from lg (owner, 2026-10-16): Scheduled (the reader's
 *  dated to-dos and tasks) and Add a to-do, both in the Next event template,
 *  then Ask Revenact in the rest, about Work. A to-do added here lands in
 *  My work through `todoAdded`, as if the list's own box had added it. */
export function WorkAskPane() {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [cleared, setCleared] = useState(false);
  return (
    <CopilotRail
      label="Ask Revenact"
      className="w-[320px]"
      top={
        <div data-part="work-pane" className="flex max-h-[60%] min-h-0 shrink-0 flex-col gap-3 overflow-y-auto custom-scrollbar">
          <ScheduledCard />
          <RailCard title="Add a to-do" icon={Plus}>
            <QuickAdd onAdded={todoAdded} bare />
          </RailCard>
        </div>
      }
      context={cleared ? null : { kind: 'label', label: 'Work', icon: <ListTodo className="h-3.5 w-3.5" aria-hidden="true" /> }}
      onClearContext={() => setCleared(true)}
      conversation={conversation}
      onConversation={setConversation}
    />
  );
}

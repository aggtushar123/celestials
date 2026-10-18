// Under the mailbox header: the 12-month import while it runs, why a Google
// mailbox is paused (contract §6 summary), and, from D2, why changes cannot
// reach Gmail (read-only or disconnected, Decision 5). Always mounted, so a
// screen reader hears it change.

import { Link } from 'react-router-dom';
import { CirclePause, Unplug } from 'lucide-react';
import type { MailSummary } from '../../features/mail/mailboxSlice';
import { importLine, pausedNotice, type MailActionGate } from '../../features/mail/mailText';
import { Figured } from '../../components/brain/Figured';
import { FOCUS, INLINE_TARGET, TYPE } from '../../components/ui';

const OPEN_GATE: MailActionGate = { gmail: false, blocked: null, reconnect: false };

export function MailboxNotice({ summary, gate = OPEN_GATE }: { summary: MailSummary | null; gate?: MailActionGate }) {
  const paused = summary?.paused_reason ? pausedNotice(summary.paused_reason) : null;
  const importing = summary?.import?.state === 'importing' ? importLine(summary.import) : null;
  // A paused mailbox already says so in the line above.
  const blocked = !paused && gate.blocked ? gate.blocked : null;
  return (
    <div role="status" className={`flex flex-col gap-1 px-4 ${paused || importing || blocked ? 'pb-2' : ''}`.trim()}>
      {paused ? (
        <p className="flex items-center gap-2 text-[13px] leading-5 text-ink">
          <CirclePause className="h-4 w-4 shrink-0" aria-hidden="true" />
          {paused}
        </p>
      ) : null}
      {blocked ? (
        <p className="flex flex-wrap items-center gap-x-2 text-[13px] leading-5 text-ink">
          <Unplug className="h-4 w-4 shrink-0" aria-hidden="true" />
          {blocked}
          {gate.reconnect ? (
            <Link to="/settings/connections" className={`font-semibold underline-offset-2 hover:underline ${INLINE_TARGET} ${FOCUS}`}>
              Open Connections
            </Link>
          ) : null}
        </p>
      ) : null}
      {importing ? (
        <p className={TYPE.meta}>
          <Figured text={importing} />
        </p>
      ) : null}
    </div>
  );
}

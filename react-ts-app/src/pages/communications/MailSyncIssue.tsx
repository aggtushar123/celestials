// A change that did not reach Gmail (D2 contract §5): the server's
// sentence, quiet, on the message it happened to. The bell carries the
// notification; this stays until a later change to the message.

import { CircleAlert } from 'lucide-react';
import type { SyncIssue } from '../../features/mail/mailboxSlice';
import { TYPE } from '../../components/ui';

export function SyncIssueLine({ issue }: { issue: SyncIssue | null }) {
  if (!issue) return null;
  return (
    <p className={`flex items-center gap-1.5 ${TYPE.meta}`}>
      <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {issue.text}
    </p>
  );
}

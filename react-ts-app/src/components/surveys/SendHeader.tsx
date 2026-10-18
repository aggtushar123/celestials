import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { deleteSend } from '../../features/surveys/surveyApi';
import { dayLabel } from '../../features/surveys/surveyText';
import type { SurveySend } from '../../features/surveys/surveyTypes';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { Badge, DetailHeader, FOCUS, INLINE_TARGET } from '../ui';
import { TypeChip } from './TypeChip';

function sharingLabel(send: SurveySend): string {
  if (send.sharing === 'private') return 'Private';
  if (send.sharing === 'workspace') return 'Shared with the workspace';
  const names = send.shared_with.map((person) => person.name);
  if (names.length === 0) return 'Shared with chosen teammates';
  if (names.length <= 2) return `Shared with ${names.join(' and ')}`;
  return `Shared with ${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/** Nothing while it sends: the header's status region says "Sending now". */
function whenLabel(send: SurveySend): string | null {
  if (send.status === 'draft') return 'Not sent';
  if (send.status === 'sending' || !send.sent_at) return null;
  return `Sent ${dayLabel(send.sent_at)}`;
}

/** The send's header (spec §2.3; UI foundations spec §6.1): name, type,
 *  segment, date, sender and sharing; Edit for the owner of a sent survey (only name and sharing
 *  change; a draft has the page's Edit and send); Delete for the owner of
 *  a draft (backend Decision 15). A segment the reader can't open is named,
 *  never linked. */
export function SendHeader({ send }: { send: SurveySend }) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const segment = send.segment;
  const segmentName =
    segment === null ? (
      <span>a deleted segment</span>
    ) : segment.id === null ? (
      <span className="text-ink">{segment.name}</span>
    ) : (
      <Link to={`/segments/${segment.id}`} className={`${INLINE_TARGET} text-ink underline ${FOCUS}`}>
        {segment.name}
      </Link>
    );
  const when = whenLabel(send);
  const parts = [segmentName, ...(when ? [when] : []), send.is_owner ? 'By you' : `By ${send.owner.name}`, sharingLabel(send)];
  return (
    <div data-part="send-header">
      <DetailHeader
        title={send.name}
        actions={send.is_owner && send.status !== 'draft' ? [{ key: 'edit', label: 'Edit', icon: Pencil, to: `/surveys/${send.id}/edit` }] : []}
        menu={send.is_owner && send.status === 'draft' ? [{ key: 'delete', label: 'Delete', onSelect: () => setDeleting(true), danger: true }] : []}
        meta={
          <>
            <TypeChip type={send.survey_type} />
            {send.status === 'draft' ? <Badge>Draft</Badge> : null}
            <span>to</span>
            {/* Each part carries its own trailing dot, so a wrapped line never starts with one. */}
            {parts.map((part, index) => (
              <span key={index}>
                {index > 0 ? ' ' : ''}
                {part}
                {index < parts.length - 1 ? ' ·' : ''}
              </span>
            ))}
          </>
        }
        status={send.status === 'sending' ? 'Sending now' : null}
      />
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${send.name}?`}
          message="This draft is deleted. Nothing was sent."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            try {
              await deleteSend(send.id);
            } catch (err) {
              // ConfirmDialog shows a thrown string as its error.
              throw errorMessage(err, 'Could not delete this survey.');
            }
            navigate('/surveys');
          }}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </div>
  );
}

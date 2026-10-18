import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Copy, Download, Pencil, Send } from 'lucide-react';
import type { SentencePart } from '../../features/segments/ruleSentence';
import { deleteSegment, duplicateSegment, exportMembers } from '../../features/segments/segmentApi';
import type { PersonRef, Segment } from '../../features/segments/segmentTypes';
import { MadeByLine } from '../agents/MadeByLine';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { DetailHeader, type HeaderAction } from '../ui';
import type { MenuItem } from '../ui/Menu';
import { RuleSentence } from './RuleSentence';

function names(people: PersonRef[]): string {
  if (people.length <= 2) return people.map((person) => person.name).join(' and ');
  return `${people[0].name}, ${people[1].name} and ${people.length - 2} more`;
}

function sharingText(segment: Segment): string {
  if (segment.sharing === 'private') return 'Private';
  if (segment.sharing === 'workspace') return 'Shared with the workspace';
  return `Shared with ${names(segment.shared_with)}`;
}

/** The segment's header (spec §3; UI foundations spec §9.2 row 3): name,
 *  description, owner and sharing, the rules as one sentence. The owner sees
 *  Edit and Survey these, and the menu holds Duplicate, Export CSV, Automate
 *  and Delete (last, danger); anyone else who can read it sees Duplicate and
 *  Export CSV. Delete reuses the shared ConfirmDialog (Ruling G19). */
export function SegmentHeader({
  segment,
  parts,
  exportQuery,
  onNotice,
}: {
  segment: Segment;
  parts: SentencePart[];
  /** The Members tab's own search and sort, so the file matches the list. */
  exportQuery: string;
  onNotice: (message: string | null) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState<'duplicate' | 'export' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Set by Duplicate below, once: the row that opened it is gone on the
  // new page, so there is nothing else to send focus to but its own title.
  const focusTitle = Boolean((location.state as { focusTitle?: boolean } | null)?.focusTitle);
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);

  const run = async (what: 'duplicate' | 'export') => {
    if (busy) return;
    setBusy(what);
    onNotice(null);
    try {
      if (what === 'duplicate') {
        const copy = await duplicateSegment(segment.id);
        navigate(`/segments/${copy.id}`, { state: { focusTitle: true } });
      } else {
        await exportMembers(segment.id, exportQuery);
      }
    } catch (err) {
      onNotice(errorMessage(err, what === 'duplicate' ? 'Could not duplicate this segment.' : 'Could not export the members.'));
    } finally {
      setBusy(null);
    }
  };

  const owner = segment.is_owner;
  const duplicate: HeaderAction = {
    key: 'duplicate',
    label: 'Duplicate',
    icon: Copy,
    onSelect: () => void run('duplicate'),
    disabled: busy !== null,
    busyLabel: busy === 'duplicate' ? 'Duplicating…' : undefined,
  };
  const exportCsv: HeaderAction = {
    key: 'export',
    label: 'Export CSV',
    icon: Download,
    onSelect: () => void run('export'),
    disabled: busy !== null,
    busyLabel: busy === 'export' ? 'Exporting…' : undefined,
  };
  const actions: readonly [HeaderAction, HeaderAction] = owner
    ? [
        { key: 'edit', label: 'Edit', icon: Pencil, to: `/segments/${segment.id}/edit` },
        // Surveys spec §2.5: a survey goes to the sender's own segment.
        { key: 'survey', label: 'Survey these', icon: Send, to: `/segments/${segment.id}/survey` },
      ]
    : [duplicate, exportCsv];
  const menu: MenuItem[] = owner
    ? [
        { key: 'duplicate', label: busy === 'duplicate' ? 'Duplicating…' : 'Duplicate', onSelect: () => void run('duplicate') },
        { key: 'export', label: busy === 'export' ? 'Exporting…' : 'Export CSV', onSelect: () => void run('export') },
        // Rules spec §2.5: a rule runs on its owner's own segment.
        { key: 'automate', label: 'Automate', onSelect: () => navigate(`/segments/${segment.id}/rule`) },
        { key: 'delete', label: 'Delete', onSelect: () => setDeleting(true), danger: true },
      ]
    : [];

  return (
    <>
      <DetailHeader
        title={segment.name}
        titleRef={titleRef}
        description={segment.description || undefined}
        actions={actions}
        menu={menu}
        meta={
          // One span per part, the dot trailing, so a wrapped phone line never starts with "·";
          // the spaces between keep the text whole for a screen reader (the flex row drops them).
          <>
            <span>{owner ? 'Yours' : `Owned by ${segment.owner.name}`} ·</span>{' '}
            <span>
              {sharingText(segment)}
              {segment.paused ? ' ·' : ''}
            </span>
            {segment.paused ? (
              <>
                {' '}
                <span>Paused</span>
              </>
            ) : null}
          </>
        }
        status={busy === 'duplicate' ? 'Duplicating the segment…' : busy === 'export' ? 'Exporting the members…' : null}
      >
        <RuleSentence parts={parts} />
        <MadeByLine madeBy={segment.made_by} />
      </DetailHeader>
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${segment.name}?`}
          message="Its rules, pins and history are deleted. The records in it are not touched."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            try {
              await deleteSegment(segment.id);
            } catch (err) {
              // ConfirmDialog shows a thrown string as its error.
              throw errorMessage(err, 'Could not delete this segment.');
            }
            navigate('/segments');
          }}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, Pencil, Send } from 'lucide-react';
import { deleteCampaign, updateCampaign } from '../../features/campaigns/campaignApi';
import { needsRoles } from '../../features/campaigns/campaignDraft';
import { campaignErrors } from '../../features/campaigns/campaignErrors';
import { rolesText, segmentKindOf } from '../../features/campaigns/campaignText';
import type { Campaign } from '../../features/campaigns/campaignTypes';
import { sharingText } from '../../features/rules/ruleText';
import { MadeByLine } from '../agents/MadeByLine';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { DetailHeader, TYPE, type HeaderAction } from '../ui';
import type { MenuItem } from '../ui/Menu';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { SegmentName, StatusPill } from './parts';
import { SendDialog } from './SendDialog';

type Asking = 'archive' | 'unarchive' | 'delete' | null;

/** The campaign's header (spec §2.3): its name; status, segment, roles,
 *  owner and sharing; for the owner Edit, Send now…, Archive (or Unarchive)
 *  and, while it has never been sent, Delete; a notice once it is archived. */
export function CampaignHeader({ campaign, onReplace, onSent }: { campaign: Campaign; onReplace: (campaign: Campaign) => void; onSent: (sendId: number) => void }) {
  const navigate = useNavigate();
  const [asking, setAsking] = useState<Asking>(null);
  const [sending, setSending] = useState(false);
  const submit = useSubmitOnce();
  const archived = campaign.status === 'archived';
  const kind = campaign.segment ? segmentKindOf(campaign.segment.kind) : null;
  const canSend = campaign.is_owner && !archived && campaign.segment !== null;

  /** ConfirmDialog shows a thrown string as its error. */
  async function write<T>(work: () => Promise<T>, fallback: string): Promise<T | null> {
    const outcome = await submit.run(work);
    if (!outcome) return null;
    if (!outcome.ok) throw campaignErrors(outcome.error, fallback).form ?? fallback;
    return outcome.value;
  }

  const edit: HeaderAction = { key: 'edit', label: 'Edit', icon: Pencil, to: `/campaigns/${campaign.id}/edit` };
  const send: HeaderAction = { key: 'send', label: 'Send now…', icon: Send, onSelect: () => setSending(true), primary: true };
  const actions: HeaderAction[] = campaign.is_owner ? (canSend ? [send, edit] : [edit]) : [];
  const menu: MenuItem[] = campaign.is_owner
    ? [
        { key: 'archive', label: archived ? 'Unarchive' : 'Archive', onSelect: () => setAsking(archived ? 'unarchive' : 'archive') },
        ...(campaign.can_delete ? [{ key: 'delete', label: 'Delete', onSelect: () => setAsking('delete'), danger: true }] : []),
      ]
    : [];
  const metaParts = [
    <SegmentName key="segment" segment={campaign.segment} />,
    ...(needsRoles(kind) && campaign.roles.length > 0 ? [rolesText(campaign.roles)] : []),
    campaign.is_owner ? 'Yours' : `Owned by ${campaign.owner.name}`,
    sharingText(campaign.sharing, campaign.shared_with),
  ];
  return (
    <>
      <DetailHeader
        title={campaign.name}
        actions={actions}
        menu={menu}
        meta={
          <>
            <StatusPill status={campaign.status} />
            {/* Each part carries its own trailing dot, so a wrapped line never starts with one. */}
            {metaParts.map((part, index) => (
              <span key={index} className="inline-flex min-w-0 items-center">
                {part}
                {index < metaParts.length - 1 ? <span className="whitespace-pre"> ·</span> : null}
              </span>
            ))}
          </>
        }
        status={
          archived ? (
            <p data-part="archived" className={`flex items-start gap-2 ${TYPE.bodyMuted}`}>
              <Archive className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {campaign.is_owner ? 'This campaign is archived. Unarchive it to send it again.' : 'This campaign is archived.'}
            </p>
          ) : null
        }
      >
        <MadeByLine madeBy={campaign.made_by} />
      </DetailHeader>
      {asking === 'archive' || asking === 'unarchive' ? (
        <ConfirmDialog
          title={`${asking === 'archive' ? 'Archive' : 'Unarchive'} ${campaign.name}?`}
          message={
            asking === 'archive'
              ? "It can't be sent until you unarchive it, and rules that use it switch themselves off. Its sends stay as they are."
              : 'It can be sent again.'
          }
          confirmLabel={asking === 'archive' ? 'Archive' : 'Unarchive'}
          onConfirm={async () => {
            const saved = await write(() => updateCampaign(campaign.id, { status: asking === 'archive' ? 'archived' : 'active' }), 'Could not change it. Try again.');
            if (saved) onReplace(saved);
          }}
          onClose={() => setAsking(null)}
        />
      ) : null}
      {asking === 'delete' ? (
        <ConfirmDialog
          title={`Delete ${campaign.name}?`}
          message="This can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            // A 204 resolves null; only a refusal throws (and stays in the dialog).
            await write(() => deleteCampaign(campaign.id), 'Could not delete it. Try again.');
            navigate('/campaigns');
          }}
          onClose={() => setAsking(null)}
        />
      ) : null}
      {sending ? (
        <SendDialog
          campaign={campaign}
          onClose={() => setSending(false)}
          onSent={(send) => {
            setSending(false);
            onSent(send.id);
          }}
        />
      ) : null}
    </>
  );
}

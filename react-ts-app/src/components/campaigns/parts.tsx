import { Layers, Network, Users, CheckCircle2, Clock, MinusCircle, type LucideIcon } from 'lucide-react';
import { STATUS_LABEL } from '../../features/campaigns/campaignOptions';
import { segmentKindOf } from '../../features/campaigns/campaignText';
import type { CampaignStatus, DeliveryStatus as Status, SegmentRef } from '../../features/campaigns/campaignTypes';
import { KIND_LABEL } from '../../features/segments/segmentFields';
import type { SegmentKind } from '../../features/segments/segmentTypes';
import { Badge, type BadgeTone } from '../ui';

/** Semantic tint for status only (house rule §4.2): Active is the one tone. */
const STATUS_TONE: Record<CampaignStatus, BadgeTone> = { draft: 'neutral', active: 'success', archived: 'neutral' };

/** Draft, Active or Archived: a word, tinted only when it is live. */
export function StatusPill({ status }: { status: CampaignStatus }) {
  return (
    <span data-status={status} className="inline-flex shrink-0">
      <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
    </span>
  );
}

/** The sidebar's icon for each record kind. */
const KIND_ICON: Record<SegmentKind, LucideIcon> = { customer: Network, account: Layers, contact: Users };

/** The segment's name after its kind's icon; the kind is read out too. */
export function SegmentName({ segment }: { segment: SegmentRef }) {
  if (!segment) return <span className="text-ink-muted">No segment</span>;
  const kind = segmentKindOf(segment.kind);
  const Icon = KIND_ICON[kind];
  return (
    <span className="inline-flex min-w-0 items-center gap-1 align-middle">
      <Icon className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <span className="sr-only">{KIND_LABEL[kind]}: </span>
      <span className="truncate">{segment.name}</span>
    </span>
  );
}

const DELIVERY: Record<Status, { icon: LucideIcon; label: string; tone: string }> = {
  sent: { icon: CheckCircle2, label: 'Sent', tone: 'text-success-ink' },
  skipped: { icon: MinusCircle, label: 'Skipped', tone: 'text-ink-muted' },
  queued: { icon: Clock, label: 'Waiting', tone: 'text-ink-muted' },
};

/** A delivery's status: Sent, Skipped or Waiting, with its icon. */
export function DeliveryStatus({ status }: { status: Status }) {
  const { icon: Icon, label, tone } = DELIVERY[status];
  return (
    <span data-delivery-status={status} className={`inline-flex shrink-0 items-center gap-1 text-[13px] ${tone}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </span>
  );
}

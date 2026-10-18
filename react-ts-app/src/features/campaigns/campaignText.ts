// Campaigns' sentences, as data: each figure apart from its words so the
// page can set it in DM Mono (Parts, Lines).
import { CONTACT_ROLES } from '../contacts/contactsParams';
import type { SentencePart } from '../segments/ruleSentence';
import type { SegmentKind } from '../segments/segmentTypes';
import type { ContactRole } from '../surveys/surveyTypes';
import { dayLabel, type Line } from '../surveys/surveyText';
import { REASON_LABEL, SKIP_ORDER, SKIP_WORDS } from './campaignOptions';
import type { Audience, CampaignRow, CampaignSegmentKind, CampaignSend, Counts, DeliveryRecord, Skipped, SkipReason } from './campaignTypes';

export const NO_SKIPS: Skipped = { unsubscribed: 0, no_email: 0, already_received: 0, recent_campaign: 0, over_limit: 0, failed: 0 };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const join = (text: string): SentencePart => ({ text, role: 'join' });
const figure = (n: number): SentencePart => ({ text: String(n), role: 'value', numeric: true });

/** Contract note 1. */
export function segmentKindOf(kind: CampaignSegmentKind): SegmentKind {
  return kind === 'organization' ? 'customer' : kind;
}

export function skippedTotal(skipped: Skipped): number {
  return SKIP_ORDER.reduce((sum, reason) => sum + (skipped[reason] ?? 0), 0);
}

/** The skips, counted and never named, in the backend's order. */
export function skipLines(skipped: Skipped): Line[] {
  return SKIP_ORDER.filter((reason) => (skipped[reason] ?? 0) > 0).map((reason) => ({ n: skipped[reason], text: SKIP_WORDS[reason] }));
}

/** "Emails 212 people · Skips 14 unsubscribed · 9 emailed in the last 3 days" (spec §2.2). */
export function audienceParts(audience: Pick<Audience, 'reach' | 'skipped' | 'sample'>): SentencePart[] {
  const parts: SentencePart[] = [join('Emails '), figure(audience.reach), join(` ${plural(audience.reach, 'person', 'people')}`)];
  skipLines(audience.skipped).forEach((line, index) => {
    parts.push(join(index === 0 ? ' · Skips ' : ' · '), figure(line.n), join(` ${line.text}`));
  });
  return parts;
}

/** "6 sent · 2 skipped". */
export function countsParts(counts: Counts): SentencePart[] {
  return [figure(counts.sent), join(' sent · '), figure(skippedTotal(counts.skipped)), join(' skipped')];
}

/** "2 Oct" (rows; headers keep the year). */
export function shortLabel(iso: string): string {
  return dayLabel(iso).replace(/ \d{4}$/, '');
}

/** A list row's last send (spec §2.1). */
export function lastSendParts(row: Pick<CampaignRow, 'needs_segment' | 'last_send'>): SentencePart[] {
  if (row.needs_segment) return [join('Choose a segment to send')];
  const last = row.last_send;
  if (!last) return [join('Never sent')];
  if (last.status === 'sending') return [join('Sending…')];
  return [...(last.finished_at ? [join(`${shortLabel(last.finished_at)} · `)] : []), ...countsParts(last.counts)];
}

/** "Sent by Alice", "From rule EMEA renewals", "From a rule" (Contract note 10). */
export function sendByText(send: Pick<CampaignSend, 'kind' | 'sent_by' | 'rule' | 'migrated'>): string {
  if (send.kind === 'rule') {
    if (!send.rule || send.rule.id === null) return `From ${send.rule?.name ?? 'a rule'}`;
    return `From rule ${send.rule.name}`;
  }
  return send.sent_by ? `Sent by ${send.sent_by.name}` : 'Sent';
}

/** "2 Oct 2026": when it finished, or began while it is still sending. */
export function sendDay(send: Pick<CampaignSend, 'started_at' | 'finished_at'>): string {
  return dayLabel(send.finished_at ?? send.started_at);
}

export function rolesText(roles: readonly ContactRole[]): string {
  return roles.map((role) => CONTACT_ROLES.find((option) => option.value === role)?.label ?? role).join(', ');
}

export function reasonText(reason: SkipReason | ''): string {
  return reason ? REASON_LABEL[reason] : '';
}

/** "3 more people you can't open", or nothing. */
export function hiddenPeople(n: number): Line | null {
  if (n <= 0) return null;
  return { n, text: `more ${plural(n, 'person', 'people')} you can't open` };
}

/** The footer every email carries (spec §1.5), for the local preview; the
 *  dash line is drawn as a rule, not typed. */
export function footerLines(sender: string, workspace: string): string[] {
  return [`${sender}, ${workspace}`, 'Unsubscribe from these emails: link'];
}

export function campaignPath(id: number, send?: number): string {
  return send ? `/campaigns/${id}?send=${send}` : `/campaigns/${id}`;
}

export function recordPath(record: DeliveryRecord): string {
  return record.kind === 'account' ? `/accounts/${record.id}` : `/organizations/${record.id}`;
}

// Gmail's user labels on a mail row, the open conversation and the sidebar
// (contract §6; D2 §4). Each chip is a neutral pill in tokens, so it reads
// in both themes, with the label's own Gmail colour as its dot: the
// person's own key, kept from Gmail (D1 Decision 4). A label made here and
// not yet created in Gmail has a dashed edge (D2 Decision 13).

import type { MailLabel } from '../../features/mail/mailboxSlice';
import { LABEL_PENDING } from '../../features/mail/mailText';
import { NUM, TYPE } from '../../components/ui';

const HEX6 = /^#[0-9a-f]{6}$/i;

/** The label's Gmail colour as a 6px dot, or the faint ink without one. */
export function LabelDot({ label }: { label: Pick<MailLabel, 'color'> }) {
  const colour = label.color && HEX6.test(label.color.background) ? label.color.background : null;
  return <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${colour ? '' : 'bg-ink-faint'}`} style={colour ? { backgroundColor: colour } : undefined} />;
}

export function LabelChips({ labels, max }: { labels: MailLabel[]; max?: number }) {
  if (labels.length === 0) return null;
  const shown = max === undefined ? labels : labels.slice(0, max);
  const more = labels.length - shown.length;
  return (
    <span role="group" aria-label={`Labels: ${labels.map((l) => l.name).join(', ')}`} className="inline-flex min-w-0 flex-wrap items-center gap-1 align-middle">
      {shown.map((label) => (
        <span
          key={label.id}
          title={label.pending ? LABEL_PENDING : undefined}
          className={`inline-flex max-w-[10rem] items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-[11px] leading-4 text-ink-muted ${label.pending ? 'border border-dashed border-line' : ''}`}
        >
          <LabelDot label={label} />
          <span className="truncate">{label.name}</span>
        </span>
      ))}
      {more > 0 ? <span className={`${TYPE.meta} ${NUM}`}>+{more}</span> : null}
    </span>
  );
}

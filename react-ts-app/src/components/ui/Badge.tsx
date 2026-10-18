import type { ReactNode } from 'react';

// Status pills (UI foundations spec §5.7). Tints only, sentence case, no
// icons but the dot; at most two per row and one per tile or card header.

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const BASE = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] leading-4 font-semibold';

const TINT: Record<BadgeTone, string> = {
  neutral: 'bg-subtle text-ink-muted',
  success: 'bg-success-dim text-success-ink',
  warning: 'bg-warning-dim text-warning-ink',
  danger: 'bg-danger-dim text-danger-ink',
  info: 'bg-info-dim text-info-ink',
};

const DOT: Record<BadgeTone, string> = {
  neutral: 'bg-ink-faint',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

/** `dot` draws a leading status dot instead of the tint, for inline status
 *  in dense tables. `truncate` caps the pill at 10rem with an ellipsis. */
export function Badge({ tone = 'neutral', dot = false, truncate = false, children }: { tone?: BadgeTone; dot?: boolean; truncate?: boolean; children: ReactNode }) {
  const body = truncate ? <span className="min-w-0 truncate">{children}</span> : children;
  const cap = truncate ? ' max-w-[10rem]' : '';
  if (dot) {
    return (
      <span className={`${BASE}${cap} text-ink-muted`}>
        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[tone]}`} />
        {body}
      </span>
    );
  }
  return <span className={`${BASE}${cap} ${TINT[tone]}`}>{body}</span>;
}

export type HealthBadgeBand = 'good' | 'average' | 'poor';

/** The only health-band tone map: good is success, average warning, poor danger. */
const HEALTH: Record<HealthBadgeBand, { tone: BadgeTone; label: string }> = {
  good: { tone: 'success', label: 'Good' },
  average: { tone: 'warning', label: 'Average' },
  poor: { tone: 'danger', label: 'Poor' },
};

export function HealthBadge({ band, children }: { band: HealthBadgeBand; children?: ReactNode }) {
  return <Badge tone={HEALTH[band].tone}>{children ?? HEALTH[band].label}</Badge>;
}

export type SentimentBadgeValue = 'positive' | 'neutral' | 'negative';

/** The only sentiment tone map: positive is success, neutral neutral, negative danger. */
const SENTIMENT: Record<SentimentBadgeValue, { tone: BadgeTone; label: string }> = {
  positive: { tone: 'success', label: 'Positive' },
  neutral: { tone: 'neutral', label: 'Neutral' },
  negative: { tone: 'danger', label: 'Negative' },
};

export function SentimentBadge({ value, children }: { value: SentimentBadgeValue; children?: ReactNode }) {
  return <Badge tone={SENTIMENT[value].tone}>{children ?? SENTIMENT[value].label}</Badge>;
}

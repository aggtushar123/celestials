import type { Tone } from '../../features/brain/brainText';
import { FOCUS } from '../ui';

/** A change's colour: trend only, always beside its direction word, in the
 *  readable ink (UI foundations spec §5.7, §7). */
export const TONE_CLASS: Record<Tone, string> = {
  good: 'text-success-ink',
  bad: 'text-danger-ink',
  neutral: 'text-ink-muted',
};

/** @deprecated A list is a ListCard (UI foundations spec §9.1). Kept for
 *  the task panel and the Work settings pieces until their PRs. */
export const LIST = 'divide-y divide-line rounded-xl border border-line bg-surface';
/** A record or contact link inside a row. */
export const LINK = `inline-flex min-h-11 items-center text-[13px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`;

/** @deprecated Section titles are TYPE.title (UI foundations spec §2). Kept
 *  for the task panel until its PR. */
export const SECTION_TITLE = 'text-[11px] font-semibold uppercase tracking-wider text-ink-muted';

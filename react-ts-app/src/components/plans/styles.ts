// Shared class strings for the Plans builder surfaces (New plan, the
// template builder), written once so later tasks import rather than
// redefine them.
import { FOCUS } from '../organizations/portfolio/styles';

/** A review field's input frame (name, dates, milestone and task rows). */
export const INPUT = `min-h-11 sm:min-h-9 w-full rounded-lg border bg-surface px-3 text-[13px] text-ink placeholder:text-ink-muted hover:border-line-strong focus:border-line-strong ${FOCUS}`;

/** What a template's sharing shows teammates, from Save as template and the
 *  template editor. */
export const SHARING_NOTE = 'Teammates can start plans from it. Only you can change it.';

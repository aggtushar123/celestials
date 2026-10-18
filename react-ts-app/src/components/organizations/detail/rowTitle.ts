import { FOCUS } from '../../ui';

/** A row title that opens something (a task, a thread, more text): a 44px
 *  line box on phones, one plain line from sm, so every row in a list is
 *  the same height whatever its title does (Records audit S4). */
export const TITLE_CONTROL = `inline-block max-w-full truncate rounded-sm text-left align-top hover:underline max-sm:leading-[2.75rem] ${FOCUS}`;

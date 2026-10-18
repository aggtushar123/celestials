import { useLocation, type To } from 'react-router-dom';
import { withTask } from '../../features/work/taskParam';

/** The history state an in-app task link pushes, so the panel's Close can
 *  step back over its own entry instead of leaving a dead one behind. */
export const OPENED_HERE = { taskOpenedHere: true } as const;

export function openedHere(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as { taskOpenedHere?: unknown }).taskOpenedHere === true;
}

/** A Link's `to` and `state` for task `id`: this page, its query kept, plus
 *  ?task=, marked as opened here. Spread it: `<Link {...taskLink(id)}>`. */
export function useTaskLink(): (id: number) => { to: To; state: typeof OPENED_HERE } {
  const { pathname, search } = useLocation();
  return (id) => ({ to: { pathname, search: withTask(search, id) }, state: OPENED_HERE });
}

import { Navigate, useLocation } from 'react-router-dom';

/** A redirect that keeps the query and the history state (Decision 15), and
 *  sets `set` on top: /work/today?task=41 opens the task panel on My work,
 *  and the bell's "opened here" state still lets Close step back. */
export function KeepQueryRedirect({ to, set = {} }: { to: string; set?: Record<string, string> }) {
  const { search, state } = useLocation();
  const query = new URLSearchParams(search);
  for (const [key, value] of Object.entries(set)) query.set(key, value);
  const text = query.toString();
  return <Navigate to={`${to}${text ? `?${text}` : ''}`} replace state={state} />;
}

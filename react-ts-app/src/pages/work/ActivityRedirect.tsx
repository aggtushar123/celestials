import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { fetchAction } from '../../features/agents/agentsApi';
import { HISTORY } from '../../features/agents/bundleText';
import { LoadingState } from '../../components/ui';
import { WorkFrame } from '../../components/work/WorkFrame';

const HISTORY_PATH = '/work?queue=history';
const MINE_PATH = '/work?queue=mine';

/** /work/activity (Activity's old links, frontend Decision 13): with
 *  ?action=<id> the bundle that action is a step of opens, on Mine while the
 *  step still waits and in History otherwise; a read that fails, or no id,
 *  lands on History. */
export function ActivityRedirect() {
  const [params] = useSearchParams();
  const action = Number(params.get('action')) || null;
  const [to, setTo] = useState<{ action: number; path: string } | null>(null);
  useEffect(() => {
    if (action === null) return;
    let alive = true;
    fetchAction(action).then(
      (found) =>
        alive &&
        setTo({
          action,
          path: typeof found.bundle === 'number' ? `${found.status === 'proposed' ? MINE_PATH : HISTORY_PATH}&bundle=${found.bundle}` : HISTORY_PATH,
        }),
      () => alive && setTo({ action, path: HISTORY_PATH }),
    );
    return () => {
      alive = false;
    };
  }, [action]);
  if (action === null) return <Navigate to={HISTORY_PATH} replace />;
  if (to && to.action === action) return <Navigate to={to.path} replace />;
  return (
    <WorkFrame>
      <LoadingState label={HISTORY.LOADING} variant="block" count={1} />
    </WorkFrame>
  );
}

import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { taskParam, withoutTask } from '../../features/work/taskParam';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { TaskSheet } from './TaskSheet';
import { openedHere } from './useTaskLink';

/** The one task panel (spec §1.5), mounted once by DashboardLayout: whatever
 *  route the reader is on, ?task=<id> opens it. Closing a panel an in-app
 *  link opened steps back over its entry, so Back is never a dead one; a
 *  page loaded with ?task= drops only that parameter, in place. Keyed by
 *  id, so another task starts fresh. */
export function TaskPanelHost() {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const isSm = useMediaQuery(SM);
  const id = taskParam(params);
  if (id === null) return null;
  const close = () => {
    if (openedHere(state)) navigate(-1);
    else setParams((prev) => withoutTask(prev), { replace: true });
  };
  return <TaskSheet key={id} id={id} isSm={isSm} onClose={close} />;
}

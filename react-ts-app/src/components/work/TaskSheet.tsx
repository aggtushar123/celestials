import type { ReactNode } from 'react';
import { WORK } from '../../features/work/workText';
import { Sheet } from '../organizations/detail/Sheet';
import { ErrorBlock } from '../organizations/portfolio/PortfolioSections';
import { TaskPanel } from './TaskPanel';
import { TaskPanelSkeleton } from './TaskPanelSkeleton';
import { useTask } from './useTask';

/** One task in the organisation page's Sheet: a panel from sm, a bottom
 *  sheet below it. Titled by the task once it lands. */
export function TaskSheet({ id, isSm, onClose }: { id: number; isSm: boolean; onClose: () => void }) {
  const load = useTask(id);
  const task = load.task;
  const title = task ? task.title : load.missing ? WORK.TASK_NOT_FOUND : WORK.TASK;
  let body: ReactNode;
  if (load.missing) body = <p className="text-[13px] text-ink-muted">{WORK.NO_TASK}</p>;
  else if (!task && load.error) body = <ErrorBlock message={load.error} onRetry={load.retry} />;
  else if (!task) body = <TaskPanelSkeleton />;
  else body = <TaskPanel task={task} onReplace={load.replace} onAppend={load.append} onMissing={load.lose} />;
  return (
    <Sheet title={title} description={task ? (task.parent ? task.parent.name : WORK.ONLY_YOU) : undefined} isSm={isSm} onClose={onClose}>
      {body}
    </Sheet>
  );
}

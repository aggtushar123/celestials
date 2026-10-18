import { useId } from 'react';
import { WORK } from '../../features/work/workText';
import type { TaskDetail, TaskEvent } from '../../features/work/workTypes';
import { SECTION_TITLE } from '../brain/styles';
import { ActivityTrail } from './ActivityTrail';
import { CommentBox } from './CommentBox';
import { TaskFacts } from './TaskFacts';
import { TaskFields } from './TaskFields';

/** The panel's body (spec §1.5): the fields, the facts, then the activity. */
export function TaskPanel({
  task,
  onReplace,
  onAppend,
  onMissing,
}: {
  task: TaskDetail;
  onReplace: (task: TaskDetail) => void;
  onAppend: (event: TaskEvent) => void;
  /** A write answered 404 (a hand-off took the task out of reach). */
  onMissing: () => void;
}) {
  const activityId = useId();
  return (
    <div className="flex flex-col gap-5">
      <TaskFields task={task} onReplace={onReplace} onMissing={onMissing} />
      <TaskFacts task={task} />
      <section aria-labelledby={activityId} className="flex flex-col gap-3 border-t border-line-subtle pt-4">
        <h3 id={activityId} className={SECTION_TITLE}>
          {WORK.ACTIVITY}
        </h3>
        <ActivityTrail events={task.events} />
        <CommentBox taskId={task.id} onAdded={onAppend} onMissing={onMissing} />
      </section>
    </div>
  );
}

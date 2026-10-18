import { useEffect, useRef } from 'react';
import type { TodoAnswer } from '../../features/work/workTypes';

const tasks = new EventTarget();
const recommendations = new EventTarget();
const feed = new EventTarget();

/** A task changed (the panel saved, a row was marked done, a task was made,
 *  a recommendation was decided on Recommended): every list that shows
 *  tasks reads again. */
export function taskChanged(): void {
  tasks.dispatchEvent(new Event('change'));
}

/** The recommendations waiting changed where no task did (Brain decided an
 *  AI-agent proposal; Run now): only the recommendation readers read again
 *  (Decision 5), so Brain's desk does not re-read after its own decision. */
export function recommendationsChanged(): void {
  recommendations.dispatchEvent(new Event('change'));
}

/** Something on the desk was decided that is neither a task nor a
 *  recommendation (a rule review, a question): only the Work badge reads again. */
export function feedChanged(): void {
  feed.dispatchEvent(new Event('change'));
}

function useEvent(target: EventTarget, onChange: () => void): void {
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const run = () => latest.current();
    target.addEventListener('change', run);
    return () => target.removeEventListener('change', run);
  }, [target]);
}

/** Runs the latest `onChange` after every `taskChanged()` while mounted. */
export function useTaskChanges(onChange: () => void): void {
  useEvent(tasks, onChange);
}

/** Runs the latest `onChange` after every `recommendationsChanged()` while mounted. */
export function useRecommendationChanges(onChange: () => void): void {
  useEvent(recommendations, onChange);
}

/** Runs the latest `onChange` after every `feedChanged()` while mounted. */
export function useFeedChanges(onChange: () => void): void {
  useEvent(feed, onChange);
}

const todos = new EventTarget();

/** A to-do was added outside the list that shows it (Work's right pane,
 *  owner 2026-10-16): My work places it as if its own box had. */
export function todoAdded(answer: TodoAnswer): void {
  todos.dispatchEvent(new CustomEvent<TodoAnswer>('added', { detail: answer }));
}

/** Runs the latest `onAdded` with each `todoAdded()` answer while mounted. */
export function useTodoAdded(onAdded: (answer: TodoAnswer) => void): void {
  const latest = useRef(onAdded);
  useEffect(() => {
    latest.current = onAdded;
  }, [onAdded]);
  useEffect(() => {
    const run = (event: Event) => latest.current((event as CustomEvent<TodoAnswer>).detail);
    todos.addEventListener('added', run);
    return () => todos.removeEventListener('added', run);
  }, []);
}

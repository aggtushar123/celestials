// The task panel's place in the URL (spec §1.5: "a side sheet at ?task=<id>
// that works on any route").
export const TASK_PARAM = 'task';

export function taskParam(search: string | URLSearchParams): number | null {
  const raw = new URLSearchParams(search).get(TASK_PARAM);
  return raw && /^\d+$/.test(raw) ? Number(raw) : null;
}

export function withTask(search: string, id: number): string {
  const next = new URLSearchParams(search);
  next.set(TASK_PARAM, String(id));
  return `?${next.toString()}`;
}

export function withoutTask(search: string | URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(search);
  next.delete(TASK_PARAM);
  return next;
}

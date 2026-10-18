// Settings › Work › Tasks and › Notifications (spec §3.3; delivery 3
// Decisions 2 to 6): the pages' words, the weekdays, the timezone and hour
// choices, each page's draft, its checks in the contract's own words, and
// the PATCH it sends (only what changed). Kept free of React. No em dash.
import type { Refusal } from './workApi';
import type { WorkSettings, WorkSettingsPatch } from './workTypes';

export const TRACK = {
  TASKS_TITLE: 'Tasks',
  REMINDERS: 'Reminders',
  TASKS_INTRO: 'When Revenact reminds people about overdue tasks, and when it tells their manager.',
  DIGEST_SECTION: 'Daily digest',
  NOTICES_INTRO: "The daily email that sums up each person's work.",
  ESCALATE: 'Tell the manager after (working days overdue)',
  ESCALATE_DETAIL:
    'Revenact reminds the assignee once a day while a task is overdue, and tells their manager once it has been overdue this many working days.',
  TIMEZONE: 'Timezone',
  TIMEZONE_DETAIL: 'Today, overdue and the digest hour follow this timezone.',
  WORKING_DAYS: 'Working days',
  WORKING_DAYS_DETAIL: 'Reminders and digests go out on these days, and only these count toward telling a manager.',
  DIGEST: 'Daily digest',
  DIGEST_DETAIL: 'One email a day to each person with something overdue, due today, blocked or waiting for them to decide.',
  DIGEST_HOUR: 'Send after',
  NO_EMAIL: "Email isn't set up on this server yet: digests are skipped",
  NO_DAYS: 'Choose at least one working day.',
  LOAD: 'Could not load these settings.',
  LOADING: 'Loading these settings',
  SAVE_FAILED: 'Could not save these settings.',
} as const;

export const hourNote = (timezone: string): string => `Local time in ${timezone}, set under Tasks.`;

export const WEEKDAYS: readonly { value: number; label: string }[] = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' },
];

export const ESCALATE_SPEC = { min: 1, max: 30 } as const;
const ESCALATE_MESSAGE = `Choose a whole number from ${ESCALATE_SPEC.min} to ${ESCALATE_SPEC.max}.`;

export const HOURS: readonly number[] = Array.from({ length: 24 }, (_, hour) => hour);

export const hourLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

export function weekdayNames(days: readonly number[]): string {
  return WEEKDAYS.filter((day) => days.includes(day.value))
    .map((day) => day.label)
    .join(', ');
}

/** Decision 3: UTC first, then the runtime's zones alphabetically, plus the
 *  stored one if the runtime lacks it; just UTC and the stored one where the
 *  runtime cannot list zones. The server is the judge of a name. */
export function timezoneOptions(stored: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = [];
  }
  const rest = [...new Set([...zones, stored])].filter((zone) => zone !== 'UTC').sort((a, b) => a.localeCompare(b));
  return zones.length === 0 ? [...new Set(['UTC', stored])] : ['UTC', ...rest];
}

const sorted = (days: readonly number[]): number[] => [...new Set(days)].sort((a, b) => a - b);
const sameDays = (a: readonly number[], b: readonly number[]): boolean => sorted(a).join() === sorted(b).join();

export interface TasksDraft {
  escalate: string;
  timezone: string;
  working_days: number[];
}

export const tasksDraftOf = (settings: WorkSettings): TasksDraft => ({
  escalate: String(settings.escalate_after_days),
  timezone: settings.timezone,
  working_days: sorted(settings.working_days),
});

function parseEscalate(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= ESCALATE_SPEC.min && value <= ESCALATE_SPEC.max ? value : null;
}

/** The browser's checks, in the contract's words, as a `Refusal` so the
 *  form shows them where it shows the server's. */
export function validateTasks(draft: TasksDraft): Refusal {
  const field: Refusal['field'] = {};
  if (parseEscalate(draft.escalate) === null) field.escalate_after_days = ESCALATE_MESSAGE;
  if (draft.working_days.length === 0) field.working_days = TRACK.NO_DAYS;
  return { field, form: null };
}

/** Only what changed (Decision 5); run it on a draft that passed `validateTasks`. */
export function tasksPatchOf(saved: WorkSettings, draft: TasksDraft): WorkSettingsPatch {
  const patch: WorkSettingsPatch = {};
  const escalate = Number(draft.escalate.trim());
  if (escalate !== saved.escalate_after_days) patch.escalate_after_days = escalate;
  if (draft.timezone !== saved.timezone) patch.timezone = draft.timezone;
  if (!sameDays(draft.working_days, saved.working_days)) patch.working_days = sorted(draft.working_days);
  return patch;
}

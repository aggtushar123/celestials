import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORK_SETTINGS } from './testWorkFixtures';
import {
  HOURS,
  hourLabel,
  tasksDraftOf,
  tasksPatchOf,
  timezoneOptions,
  validateTasks,
  weekdayNames,
} from './workTracking';

afterEach(() => vi.restoreAllMocks());

describe('timezoneOptions (Decision 3)', () => {
  it('lists UTC first, then every runtime zone alphabetically, once each', () => {
    const options = timezoneOptions('UTC');
    expect(options[0]).toBe('UTC');
    expect(options).toContain('Europe/London');
    expect(new Set(options).size).toBe(options.length);
    const rest = options.slice(1);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
  });

  it('keeps a stored zone the runtime does not list', () => {
    expect(timezoneOptions('Etc/GMT+5')).toContain('Etc/GMT+5');
  });

  it('falls back to UTC and the stored zone when the runtime cannot list zones', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockImplementation(() => {
      throw new RangeError('no');
    });
    expect(timezoneOptions('Asia/Kolkata')).toEqual(['UTC', 'Asia/Kolkata']);
    expect(timezoneOptions('UTC')).toEqual(['UTC']);
  });
});

describe('hours and weekdays', () => {
  it('labels the 24 hours as 00:00 to 23:00', () => {
    expect(HOURS).toHaveLength(24);
    expect(hourLabel(0)).toBe('00:00');
    expect(hourLabel(8)).toBe('08:00');
    expect(hourLabel(23)).toBe('23:00');
  });

  it('names working days in week order', () => {
    expect(weekdayNames([4, 0, 2])).toBe('Monday, Wednesday, Friday');
    expect(weekdayNames([5, 6])).toBe('Saturday, Sunday');
  });
});

describe('Tasks draft (Decisions 2, 5)', () => {
  it('starts from the saved settings and sends nothing while unchanged', () => {
    const draft = tasksDraftOf(WORK_SETTINGS);
    expect(draft).toEqual({ escalate: '2', timezone: 'UTC', working_days: [0, 1, 2, 3, 4] });
    expect(tasksPatchOf(WORK_SETTINGS, draft)).toEqual({});
  });

  it('sends only what changed, working days sorted', () => {
    expect(tasksPatchOf(WORK_SETTINGS, { escalate: '5', timezone: 'Asia/Kolkata', working_days: [6, 0] })).toEqual({
      escalate_after_days: 5,
      timezone: 'Asia/Kolkata',
      working_days: [0, 6],
    });
    expect(tasksPatchOf(WORK_SETTINGS, { escalate: '2', timezone: 'UTC', working_days: [4, 3, 2, 1, 0] })).toEqual({});
  });

  it('refuses in the contract’s words: escalation 1 to 30, at least one day', () => {
    expect(validateTasks({ escalate: '31', timezone: 'UTC', working_days: [] })).toEqual({
      field: { escalate_after_days: 'Choose a whole number from 1 to 30.', working_days: 'Choose at least one working day.' },
      form: null,
    });
    expect(validateTasks({ escalate: '2.5', timezone: 'UTC', working_days: [0] }).field.escalate_after_days).toBe('Choose a whole number from 1 to 30.');
    expect(validateTasks({ escalate: '', timezone: 'UTC', working_days: [0] }).field.escalate_after_days).toBe('Choose a whole number from 1 to 30.');
    expect(validateTasks({ escalate: ' 30 ', timezone: 'UTC', working_days: [0] })).toEqual({ field: {}, form: null });
  });
});

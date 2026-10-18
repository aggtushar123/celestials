import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { WORK_SETTINGS } from './testWorkFixtures';
import {
  SOURCE_SPECS,
  draftOf,
  hasErrors,
  isEmptyPatch,
  patchOf,
  rangeMessage,
  readSettingsRefusal,
  refreshSummary,
  sourceLabel,
  validateDraft,
  type SettingsDraft,
} from './workSettings';
import { REC_KINDS } from './workTypes';

const edit = (change: (draft: SettingsDraft) => void): SettingsDraft => {
  const draft = draftOf(WORK_SETTINGS);
  change(draft);
  return draft;
};

describe('workSettings: the sources (Decision 11)', () => {
  it('lists every kind in the contract’s order, each with its fields and limits', () => {
    expect(SOURCE_SPECS.map((spec) => spec.kind)).toEqual([...REC_KINDS]);
    expect(SOURCE_SPECS.map((spec) => [spec.label, spec.fields.map((f) => `${f.field} ${f.label} ${f.min}-${f.max}${f.whole ? '' : ' decimal'}`)])).toEqual([
      ['Renewal due', ['days Within (days) 1-120']],
      ['Health drop', ['drop Drop of at least 0.1-5 decimal', 'window_days Compared with (days ago) 1-120']],
      ['Urgent tickets', ['min At least (tickets) 1-50']],
      ['Anomalies', []],
    ]);
    expect(sourceLabel('health_drop')).toBe('Health drop');
    expect(sourceLabel('something_new')).toBe('something_new');
  });

  it('words a limit as the contract does', () => {
    expect(rangeMessage({ min: 1, max: 120, whole: true })).toBe('Choose a whole number from 1 to 120.');
    expect(rangeMessage({ min: 0.1, max: 5, whole: false })).toBe('Choose a number from 0.1 to 5.');
  });
});

describe('workSettings: the draft', () => {
  it('holds every number as the text the reader edits', () => {
    const draft = draftOf(WORK_SETTINGS);
    expect(draft.recommend_to).toBe('manager');
    expect(draft.cooldown).toBe('14');
    expect(draft.sources.renewal_due).toEqual({ enabled: true, values: { days: '30' } });
    expect(draft.sources.health_drop).toEqual({ enabled: true, values: { drop: '0.5', window_days: '14' } });
    expect(draft.sources.anomaly).toEqual({ enabled: true, values: {} });
  });

  it('passes the saved settings, and refuses each number outside its limits', () => {
    expect(hasErrors(validateDraft(draftOf(WORK_SETTINGS)))).toBe(false);
    const errors = validateDraft(
      edit((draft) => {
        draft.sources.renewal_due.values.days = '0';
        draft.sources.health_drop.values.drop = '5.5';
        draft.sources.health_drop.values.window_days = 'two';
        draft.sources.urgent_tickets.values.min = '2.5';
        draft.cooldown = '';
      }),
    );
    expect(hasErrors(errors)).toBe(true);
    expect(errors).toEqual({
      dismiss_cooldown_days: 'Choose a whole number from 0 to 120.',
      sources: {
        renewal_due: { days: 'Choose a whole number from 1 to 120.' },
        health_drop: { drop: 'Choose a number from 0.1 to 5.', window_days: 'Choose a whole number from 1 to 120.' },
        urgent_tickets: { min: 'Choose a whole number from 1 to 50.' },
      },
      form: null,
    });
    expect(validateDraft(edit((draft) => (draft.cooldown = '0'))).dismiss_cooldown_days).toBeUndefined();
  });

  it('keeps the drop to one decimal place (the contract), with the same range message', () => {
    expect(validateDraft(edit((draft) => (draft.sources.health_drop.values.drop = '0.55'))).sources).toEqual({
      health_drop: { drop: 'Choose a number from 0.1 to 5.' },
    });
    expect(validateDraft(edit((draft) => (draft.sources.health_drop.values.drop = '1.5'))).sources).toEqual({});
    expect(validateDraft(edit((draft) => (draft.sources.health_drop.values.drop = '2'))).sources).toEqual({});
  });
});

describe('workSettings: the PATCH (only what changed)', () => {
  it('sends nothing for an untouched draft', () => {
    expect(isEmptyPatch(patchOf(WORK_SETTINGS, draftOf(WORK_SETTINGS)))).toBe(true);
  });

  it('sends each changed field, and inside sources only the changed kinds and fields', () => {
    const draft = edit((d) => {
      d.recommend_to = 'owner';
      d.cooldown = '7';
      d.sources.renewal_due.values.days = '45';
      d.sources.health_drop.enabled = false;
      d.sources.health_drop.values.drop = ' 0.5 ';
    });
    expect(patchOf(WORK_SETTINGS, draft)).toEqual({
      recommend_to: 'owner',
      dismiss_cooldown_days: 7,
      sources: { renewal_due: { days: 45 }, health_drop: { enabled: false } },
    });
  });
});

describe('workSettings: retired kinds (contract D12)', () => {
  it('never sends overdue_tasks, open_questions or agent, even when an old server saved them', () => {
    const old = {
      ...WORK_SETTINGS,
      sources: {
        ...WORK_SETTINGS.sources,
        overdue_tasks: { enabled: true },
        open_questions: { enabled: true },
        agent: { enabled: true },
      },
    } as unknown as typeof WORK_SETTINGS;
    const draft = draftOf(old);
    draft.recommend_to = 'owner';
    draft.sources.renewal_due.values.days = '45';
    const body = JSON.stringify(patchOf(old, draft));
    for (const gone of ['overdue_tasks', 'open_questions', 'agent']) expect(body).not.toContain(gone);
    expect(patchOf(old, draft)).toEqual({ recommend_to: 'owner', sources: { renewal_due: { days: 45 } } });
    expect(isEmptyPatch(patchOf(old, draftOf(old)))).toBe(true);
  });
});

describe('workSettings: the server’s refusals, onto the form', () => {
  it('puts nested field errors under their field and a source’s own under its row', () => {
    const err = new ApiError(
      400,
      {
        recommend_to: ['Choose manager or owner.'],
        dismiss_cooldown_days: ['Choose a whole number from 0 to 120.'],
        sources: { renewal_due: { days: ['Choose a whole number from 1 to 120.'] }, anomaly: ["Send each source's settings as one object."] },
      },
      'x',
    );
    expect(readSettingsRefusal(err, 'fallback')).toEqual({
      recommend_to: 'Choose manager or owner.',
      dismiss_cooldown_days: 'Choose a whole number from 0 to 120.',
      sources: { renewal_due: { days: 'Choose a whole number from 1 to 120.' }, anomaly: { source: "Send each source's settings as one object." } },
      form: null,
    });
  });

  it('puts everything else on the form', () => {
    expect(readSettingsRefusal(new ApiError(400, { sources: ['Send the sources as one object.'] }, 'x'), 'fallback').form).toBe('Send the sources as one object.');
    expect(readSettingsRefusal(new ApiError(400, { non_field_errors: ['Send the fields as one object.'] }, 'x'), 'fallback').form).toBe('Send the fields as one object.');
    expect(readSettingsRefusal(new ApiError(403, { detail: "You don't have permission to change organisation settings." }, 'x'), 'fallback').form).toBe(
      "You don't have permission to change organisation settings.",
    );
    expect(readSettingsRefusal(new Error('offline'), 'Could not save these settings.')).toEqual({ sources: {}, form: 'Could not save these settings.' });
  });
});

describe('workSettings: Run now’s words (Decision 12)', () => {
  it('says what the run did', () => {
    expect(refreshSummary({ created: 2, updated: 5, expired: 1, unrouted: 0, notified: 2, failed: [] })).toEqual({
      text: 'Run finished: 2 new, 5 updated, 1 expired. 2 people told.',
      failed: null,
    });
    expect(refreshSummary({ created: 0, updated: 0, expired: 0, unrouted: 3, notified: 1, failed: ['renewal_due', 'health_drop'] })).toEqual({
      text: "Run finished: 0 new, 0 updated, 0 expired. 3 couldn't be sent to anyone who can open the record. 1 person told.",
      failed: 'These sources failed this run: Renewal due, Health drop.',
    });
  });

  it('reads "recommendations_waiting" in `failed` as the notice failing, not a source (the recommendations still stand)', () => {
    expect(refreshSummary({ created: 1, updated: 0, expired: 0, unrouted: 0, notified: 0, failed: ['recommendations_waiting'] })).toEqual({
      text: 'Run finished: 1 new, 0 updated, 0 expired. 0 people told.',
      failed: 'Telling people about them failed this run. The recommendations stand.',
    });
    expect(refreshSummary({ created: 1, updated: 0, expired: 0, unrouted: 0, notified: 0, failed: ['renewal_due', 'recommendations_waiting'] })).toEqual({
      text: 'Run finished: 1 new, 0 updated, 0 expired. 0 people told.',
      failed: 'These sources failed this run: Renewal due. Telling people about them failed this run. The recommendations stand.',
    });
  });
});

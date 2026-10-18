// Settings > Briefs: where the management brief goes, and when.
//
// The Slack webhook is a credential: anyone holding it can post to that
// channel, so it is written once and never shown again; the page shows
// the last few characters, enough to recognise which hook is set (see
// revenact-backend services/metrics/delivery.py).

import { useEffect, useRef, useState } from 'react';
import { Hash, Send } from 'lucide-react';
import { useCapability } from '../../hooks';
import { ApiError } from '../../lib/apiClient';
import {
  WEEKDAYS,
  createBriefSchedule,
  fetchBriefSchedule,
  removeBriefSchedule,
  sendBriefNow,
  updateBriefSchedule,
} from '../../features/briefs/briefScheduleApi';
import type { BriefSchedule, Cadence } from '../../features/briefs/briefScheduleApi';
import { BUTTON, DANGER, ErrorState, FORM_ALERT, INPUT, INVALID, LoadingState, MetaParts, NUM, PRIMARY, QUIET, Select, SettingsFrame, SettingsNote, SettingsRow, SettingsSection, TYPE } from '../../components/ui';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { settingsTitle } from './workspaceSettingsNav';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  return `${day}${['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'}`;
}

function describe(schedule: BriefSchedule): string {
  if (schedule.cadence === 'weekly') return `Every ${WEEKDAYS[schedule.weekday ?? 0]}`;
  return `The ${ordinal(schedule.day ?? 1)} of each month`;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function BriefDeliveryPage() {
  const isAdmin = useCapability('manage_org_settings');
  const [schedule, setSchedule] = useState<BriefSchedule | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  // A refused hook: shown under the field, which carries aria-invalid.
  const [hookError, setHookError] = useState<string | null>(null);
  const [confirmingStop, setConfirmingStop] = useState(false);

  const [destination, setDestination] = useState('');
  const [cadence, setCadence] = useState<Cadence>('weekly');
  const [weekday, setWeekday] = useState('0');
  const [day, setDay] = useState('1');

  // Focus that has to wait for the next render, because the control that held
  // it unmounts (Change the channel, Stop sending) or is not there yet (the
  // webhook field).
  const hookRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<(() => void) | null>(null);
  useEffect(() => {
    const run = pendingFocus.current;
    pendingFocus.current = null;
    run?.();
  });

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetchBriefSchedule()
      .then((next) => {
        if (cancelled) return;
        setSchedule(next);
        if (next.cadence) {
          setCadence(next.cadence);
          setWeekday(String(next.weekday ?? 0));
          setDay(String(next.day ?? 1));
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorText(err, 'Could not load the schedule.'));
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const live = schedule?.cadence != null;

  async function save() {
    setBusy(true);
    setActionError(null);
    setHookError(null);
    setNote(null);
    const body = {
      cadence,
      weekday: Number(weekday),
      day: Number(day),
      ...(destination.trim() ? { destination: destination.trim() } : {}),
    };
    try {
      const next = live && !destination.trim() ? await updateBriefSchedule(body) : await createBriefSchedule(body);
      setSchedule(next);
      setDestination('');
      // Closing the channel field hands focus back to the button that opened it.
      if (editing) pendingFocus.current = () => changeRef.current?.focus();
      setEditing(false);
    } catch (err) {
      // A refusal of a pasted hook belongs to its field; anything else to the page.
      if (body.destination) setHookError(errorText(err, 'Could not save the schedule.'));
      else setActionError(errorText(err, 'Could not save the schedule.'));
    } finally {
      setBusy(false);
    }
  }

  // Confirmed in the dialog, which shows a refusal and stays open: the
  // message is thrown to it as a string, never set on the page too.
  async function stop() {
    setBusy(true);
    setActionError(null);
    setNote(null);
    try {
      await removeBriefSchedule();
      setSchedule(await fetchBriefSchedule());
      setEditing(false);
      // Stop sending is gone; the webhook field it leaves behind takes focus.
      pendingFocus.current = () => hookRef.current?.focus();
    } catch (err) {
      throw errorText(err, 'Could not stop the delivery.');
    } finally {
      setBusy(false);
    }
  }

  async function sendNow() {
    setBusy(true);
    setActionError(null);
    setNote(null);
    try {
      const result = await sendBriefNow();
      setNote(result.detail);
    } catch (err) {
      setActionError(errorText(err, 'Could not send it.'));
    } finally {
      setBusy(false);
    }
  }

  const title = settingsTitle('/settings/work/briefs');
  if (!isAdmin) {
    return (
      <SettingsFrame title={title} note={<SettingsNote icon="lock">You don't have permission to change this. Ask an admin where the management brief should go.</SettingsNote>}>
        {null}
      </SettingsFrame>
    );
  }

  const needsDestination = !live || editing;
  const cannotSave = busy || (needsDestination && !destination.trim());
  return (
    <SettingsFrame title={title} intro="Post the management brief to a Slack channel on a schedule. It posts the brief that exists; it never writes one on its own.">
      {actionError ? (
        <p role="alert" className={FORM_ALERT}>
          {actionError}
        </p>
      ) : null}
      <form
        aria-label="Brief schedule"
        onSubmit={(event) => {
          event.preventDefault();
          if (!cannotSave) void save();
        }}
      >
        <SettingsSection
          title="Schedule"
          description="It goes out on its day, when the overnight job runs. A month with no such day sends on its last day instead."
          state={loadError ? <ErrorState message={loadError} /> : !loaded ? <LoadingState label="Loading the schedule" variant="block" /> : undefined}
          footer={
            <>
              {/* Always mounted: the answer to Send one now is announced. */}
              <p role="status" className={`mr-auto ${TYPE.bodyMuted}`}>
                {note ?? ''}
              </p>
              {editing ? (
                <button
                  type="button"
                  onClick={() => {
                    pendingFocus.current = () => changeRef.current?.focus();
                    setEditing(false);
                    setDestination('');
                    setHookError(null);
                  }}
                  className={QUIET}
                >
                  Cancel
                </button>
              ) : null}
              <button type="submit" aria-disabled={cannotSave || undefined} className={PRIMARY}>
                {busy ? 'Saving…' : live ? 'Save' : 'Schedule it'}
              </button>
            </>
          }
        >
          <SettingsRow label="Now">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <Hash className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
                <div className="flex min-w-0 flex-col">
                  <p className={`${TYPE.body} font-semibold`}>{live ? describe(schedule!) : 'Nothing is scheduled yet.'}</p>
                  <p className={TYPE.meta}>
                    {live ? (
                      <MetaParts
                        parts={[`Posting to the hook ending ${schedule!.destination_hint}`, schedule!.last_sent_at ? `last sent ${shortDate(schedule!.last_sent_at)}` : 'not sent yet']}
                      />
                    ) : (
                      'Paste a Slack incoming webhook and choose when it should go.'
                    )}
                  </p>
                </div>
              </div>
              {live ? (
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!busy) void sendNow();
                    }}
                    aria-disabled={busy || undefined}
                    className={BUTTON}
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    Send one now
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!busy) setConfirmingStop(true);
                    }}
                    aria-disabled={busy || undefined}
                    className={DANGER}
                  >
                    Stop sending
                  </button>
                </div>
              ) : null}
            </div>
          </SettingsRow>
          {needsDestination ? (
            <SettingsRow
              label="Slack webhook URL"
              htmlFor="brief-hook"
              hint="Written once and never shown again. Anyone holding it can post to that channel."
              hintId="brief-hook-hint"
              error={hookError ?? undefined}
              errorId="brief-hook-error"
              stacked
            >
              <input
                ref={hookRef}
                id="brief-hook"
                type="url"
                autoComplete="off"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="https://hooks.slack.com/services/…"
                aria-invalid={Boolean(hookError)}
                aria-describedby={hookError ? 'brief-hook-hint brief-hook-error' : 'brief-hook-hint'}
                className={`${INPUT} ${INVALID}`}
              />
            </SettingsRow>
          ) : (
            <div className="px-4 py-3">
              <button
                ref={changeRef}
                type="button"
                onClick={() => {
                  pendingFocus.current = () => hookRef.current?.focus();
                  setEditing(true);
                }}
                className={QUIET}
              >
                Change the channel
              </button>
            </div>
          )}
          <SettingsRow label="How often" htmlFor="brief-cadence">
            <Select
              id="brief-cadence"
              label="How often"
              labelPosition="external"
              value={cadence}
              onChange={setCadence}
              options={[
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
              ]}
              className="sm:max-w-xs"
            />
          </SettingsRow>
          <SettingsRow label="Day" htmlFor="brief-day">
            {cadence === 'weekly' ? (
              <Select
                id="brief-day"
                label="Day"
                labelPosition="external"
                value={weekday}
                onChange={setWeekday}
                options={WEEKDAYS.map((name, index) => ({ value: String(index), label: name }))}
                className="sm:max-w-xs"
              />
            ) : (
              <input id="brief-day" type="number" min="1" max="31" value={day} onChange={(event) => setDay(event.target.value)} className={`${INPUT} ${NUM} sm:w-28`} />
            )}
          </SettingsRow>
        </SettingsSection>
      </form>
      {confirmingStop ? (
        <ConfirmDialog
          title="Stop sending the brief?"
          message="The schedule and its webhook are removed. To send it again, paste the webhook again."
          confirmLabel="Stop sending"
          danger
          onConfirm={stop}
          onClose={() => setConfirmingStop(false)}
        />
      ) : null}
    </SettingsFrame>
  );
}

import { useId, useState, type FormEvent } from 'react';
import { bookMeeting, bookingRefusal } from '../../features/calendar/calendarApi';
import type { Contact } from '../../features/customers/customersSlice';
import { Field } from '../organizations/activity/FormField';
import { CONTROL, FORM_GRID } from '../organizations/activity/formStyles';
import { FORM_ALERT, FORM_OK, PRIMARY, TYPE } from '../ui';

const LENGTHS = [15, 30, 45, 60, 90];

/** Schedule meeting (Calendar delivery 3): books on the reader's own Google
 *  Calendar with a Meet link, and Google emails the invites to the contacts
 *  ticked. Only contacts with an address can be invited. One request id per
 *  form, so pressing Book again after a failure never books twice. */
export function MeetingForm({ customerId, contacts, preselect = [], onDone }: { customerId: number; contacts: Contact[]; preselect?: number[]; onDone?: () => void }) {
  const invitable = contacts.filter((c) => c.email);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [length, setLength] = useState(30);
  const [chosen, setChosen] = useState<number[]>(preselect);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const ids = useId();
  const ready = Boolean(title.trim() && date && time && chosen.length > 0) && !saving && !booked;

  function toggle(id: number) {
    setChosen((now) => (now.includes(id) ? now.filter((c) => c !== id) : [...now, id]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    // The reader's own zone: the browser turns local date and time into an instant.
    const start = new Date(`${date}T${time}`);
    const end = new Date(start.getTime() + length * 60_000);
    setSaving(true);
    setError(null);
    try {
      await bookMeeting({
        customer_id: customerId,
        contact_ids: chosen,
        title: title.trim(),
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        description: note.trim(),
        request_id: requestId,
      });
      setBooked(true);
      onDone?.();
    } catch (err) {
      setError(bookingRefusal(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="Schedule meeting" className="@container flex flex-col gap-3">
      <div className={FORM_GRID}>
        <Field id={`${ids}-title`} label="Title" wide>
          <input id={`${ids}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} className={CONTROL} />
        </Field>
        <Field id={`${ids}-date`} label="Date">
          <input id={`${ids}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={CONTROL} />
        </Field>
        <Field id={`${ids}-time`} label="Starts">
          <input id={`${ids}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} className={CONTROL} />
        </Field>
        <Field id={`${ids}-length`} label="Length">
          <select id={`${ids}-length`} value={length} onChange={(e) => setLength(Number(e.target.value))} className={CONTROL}>
            {LENGTHS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minutes
              </option>
            ))}
          </select>
        </Field>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className={TYPE.label}>Invite</legend>
        {invitable.length === 0 ? (
          <p className={TYPE.bodyMuted}>No contacts with an email address yet. Add one on the People tab first.</p>
        ) : (
          invitable.map((contact) => (
            <label key={contact.id} className="flex min-h-11 items-center gap-2 sm:min-h-9">
              <input type="checkbox" checked={chosen.includes(contact.id)} onChange={() => toggle(contact.id)} />
              <span className={TYPE.body}>{contact.name}</span>
              <span className={TYPE.meta}>{contact.email}</span>
            </label>
          ))
        )}
      </fieldset>
      <Field id={`${ids}-note`} label="Note for invitees (optional)">
        <textarea id={`${ids}-note`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={5000} className={CONTROL} />
      </Field>
      <p className={TYPE.meta}>On your Google Calendar with a Meet link. Google emails the invites from you.</p>
      <div>
        <button type="submit" disabled={!ready} className={PRIMARY}>
          {saving ? 'Booking…' : 'Book meeting'}
        </button>
      </div>
      {error ? (
        <p role="alert" className={FORM_ALERT}>
          {error}
        </p>
      ) : null}
      {booked ? (
        <p role="status" className={FORM_OK}>
          Booked with a Meet link. Google is emailing the invites.
        </p>
      ) : null}
    </form>
  );
}

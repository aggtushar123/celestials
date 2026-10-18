import { useId } from 'react';
import { SAY } from '../../features/campaigns/campaignOptions';
import { footerLines } from '../../features/campaigns/campaignText';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { ItemSkeleton } from '../organizations/portfolio/PortfolioSections';
import { TYPE } from '../ui';
import type { AudienceLoad } from './useCampaignAudience';
import { usePreview, type PreviewState } from './usePreview';

const LABEL = TYPE.label;
/** The "nobody" note is built from the backend's own sentence (controller
 *  ruling, pre-flight F3), not a second hardcoded copy of it. */
const NOBODY_NOTE = `${SAY.NOBODY.replace(/\.$/, '')}, so there is nobody to preview it for.`;

/** An email as text: subject, body, and (locally drawn) the footer, its
 *  dash line drawn as a rule. Never markup (spec §3). */
function Email({ subject, body, footer = null, dim = false }: { subject: string; body: string; footer?: string[] | null; dim?: boolean }) {
  return (
    <div data-part="email" className={`flex flex-col gap-2 ${dim ? 'opacity-60' : ''}`}>
      <p data-part="subject" className="break-words text-[13px] font-semibold text-ink">
        {subject || 'No subject yet'}
      </p>
      <p data-part="body" className="whitespace-pre-wrap break-words text-[13px] text-ink">
        {body || 'Nothing written yet.'}
      </p>
      {footer ? (
        <div data-part="footer" className="flex flex-col border-t border-line pt-2 text-[11px] text-ink-muted">
          {footer.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The server's refusal sits in one polite region that stays mounted and
 *  keeps its words while the next answer loads, so it is announced when the
 *  message changes, not on every debounced keystroke. The field carries the
 *  error itself on save. */
function ServerEmail({ state }: { state: PreviewState }) {
  const error = state.status === 'error' ? state.message : state.status === 'loading' ? state.error : null;
  const data = state.status === 'ready' ? state.data : state.status === 'loading' ? state.last : null;
  return (
    <>
      <p role="status" data-part="preview-error" className="text-[13px] leading-5 text-danger-ink empty:sr-only">
        {error}
      </p>
      {error ? null : data ? (
        <Email subject={data.subject} body={data.body} dim={state.status === 'loading'} />
      ) : (
        <ItemSkeleton count={1} label="Drawing the preview" avatar={false} />
      )}
    </>
  );
}

/** The editor's preview (spec §2.2, Decision 5): for one person in the saved
 *  campaign's audience, from the server, 400 ms after typing stops; before
 *  the first save (or with nobody to show), the typed text drawn here. */
export function PreviewPane({ campaignId, subject, body, audience, contact, onContact, stale, sender, workspace }: {
  campaignId: number | null;
  subject: string;
  body: string;
  audience: AudienceLoad;
  contact: number | null;
  onContact: (id: number) => void;
  /** The form's segment or roles differ from the saved ones. */
  stale: boolean;
  sender: string;
  workspace: string;
}) {
  const headingId = useId();
  const pickId = useId();
  const sample = audience.status === 'ready' ? audience.data.sample : [];
  const person = contact !== null && sample.some((one) => one.id === contact) ? contact : (sample[0]?.id ?? null);
  const live = campaignId !== null && person !== null;
  const state = usePreview(live ? campaignId : null, live ? { contact: person, subject, body } : null);

  let note: string | null = null;
  if (campaignId === null) note = 'Save the draft to see it for a real person.';
  else if (audience.status === 'idle') note = 'Choose a segment and save to see it for a real person.';
  else if (audience.status === 'error') note = audience.message;
  else if (audience.status === 'ready' && sample.length === 0) note = NOBODY_NOTE;

  return (
    <section aria-labelledby={headingId} aria-busy={state.status === 'loading' || audience.status === 'loading'} className="flex flex-col gap-3 rounded-xl bg-subtle p-3">
      <h3 id={headingId} className={LABEL}>
        Preview
      </h3>
      {sample.length > 0 && person !== null ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={pickId} className={LABEL}>
            Preview for
          </label>
          <select id={pickId} value={String(person)} onChange={(event) => onContact(Number(event.target.value))} className={`${FILTER_SELECT} w-full`}>
            {sample.map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {stale ? <p className="text-[11px] text-ink-muted">Save to preview it with this segment and these roles.</p> : null}
      {note ? <p className="text-[13px] text-ink-muted">{note}</p> : null}
      {live ? (
        <ServerEmail state={state} />
      ) : audience.status === 'loading' ? (
        <ItemSkeleton count={1} label="Counting who it reaches" avatar={false} />
      ) : (
        <Email subject={subject} body={body} footer={footerLines(sender, workspace)} />
      )}
    </section>
  );
}

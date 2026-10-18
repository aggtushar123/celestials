import { useEffect, useId, useRef, type RefObject } from 'react';
import { SAY } from '../../features/campaigns/campaignOptions';
import { audienceParts } from '../../features/campaigns/campaignText';
import type { Audience } from '../../features/campaigns/campaignTypes';
import { FOCUS, PRIMARY } from '../organizations/portfolio/styles';
import { Parts } from '../rules/Parts';

/** The confirm step (spec §2.2, Decision 6): whom it emails and why the
 *  rest are skipped, counted on the server just now. */
export function SendStep({ name, audience, headingRef }: { name: string; audience: Audience; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const nobody = audience.reach === 0;
  return (
    <section aria-label="Confirm the send" data-part="confirm" className="flex max-w-xl flex-col gap-3">
      <h3 ref={headingRef} tabIndex={-1} className={`text-[15px] font-semibold text-ink ${FOCUS}`}>
        Send {name} now?
      </h3>
      <p data-part="audience" className="text-[13px] text-ink">
        <Parts parts={audienceParts(audience)} />
      </p>
      {nobody ? (
        <p data-part="blocker" className="text-[13px] text-danger">
          {SAY.NOBODY}
        </p>
      ) : (
        <p className="text-[13px] text-ink-muted">
          Each person gets it once, ever, and nobody gets more than one campaign email every 3 days. Every email carries a link to unsubscribe.
        </p>
      )}
    </section>
  );
}

/** Send now, with a refusal that has no field beside it (EMAIL_NOT_SET_UP
 *  and the rest, Contract note 8): it describes the button and takes focus. */
export function SendButton({ busy, blocked, refusal, onSend }: { busy: boolean; blocked: boolean; refusal: string | null; onSend: () => void }) {
  const id = useId();
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (refusal) ref.current?.focus();
  }, [refusal]);
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={onSend} disabled={busy || blocked} aria-describedby={refusal ? id : undefined} className={PRIMARY}>
        {busy ? 'Sending…' : 'Send now'}
      </button>
      {refusal ? (
        <p ref={ref} id={id} role="alert" data-error tabIndex={-1} className={`max-w-sm text-right text-[11px] text-danger ${FOCUS}`}>
          {refusal}
        </p>
      ) : null}
    </div>
  );
}

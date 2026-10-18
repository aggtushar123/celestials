import { useRef, useState } from 'react';
import { sendCampaign } from '../../features/campaigns/campaignApi';
import { SEND_FALLBACK, sendRefusal, type CampaignErrors } from '../../features/campaigns/campaignErrors';
import type { CampaignSend } from '../../features/campaigns/campaignTypes';
import { useSubmitOnce } from '../plans/useSubmitOnce';

type Submit = ReturnType<typeof useSubmitOnce>;

/** What a Send answers: the send, the field refusals for the editor's form
 *  (only with `fieldsToForm`), or null (refused at the button, or a second
 *  click the latch dropped). */
export type SendAnswer = { sent: CampaignSend } | { fields: CampaignErrors } | null;

/** Send now, once (spec §2.2, Decision 6), for the editor and the campaign
 *  page's dialog. A fast double click both lands before React disables the
 *  button (useSubmitOnce only blocks overlapping calls, not two that each
 *  run to completion): the `sent` latch makes the second one a no-op until
 *  a refusal clears it, so a retry POSTs again. A refusal with no field
 *  stays at the button (`refusal`); a field refusal goes back to the form
 *  with `fieldsToForm`, else it too is shown at the button. Pass the
 *  editor's own `submit` so its save, count and send never overlap. */
export function useSendNow({ submit, fieldsToForm = false }: { submit: Submit; fieldsToForm?: boolean }) {
  const sent = useRef(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function send(campaignId: number): Promise<SendAnswer> {
    if (sent.current) return null;
    sent.current = true;
    setRefusal(null);
    const outcome = await submit.run(() => sendCampaign(campaignId));
    // Null only while another run of the same `submit` is in flight; that
    // run clears `busy` when it ends (final review item 10).
    if (!outcome) return null;
    if (outcome.ok) return { sent: outcome.value };
    sent.current = false;
    const refused = sendRefusal(outcome.error);
    if (refused.at === 'send') setRefusal(refused.message);
    else if (fieldsToForm) return { fields: refused.errors };
    else setRefusal(Object.values(refused.errors)[0] ?? SEND_FALLBACK);
    return null;
  }

  /** A fresh confirm step: no refusal, the latch open. */
  function reset() {
    sent.current = false;
    setRefusal(null);
  }

  return { busy: submit.busy, refusal, send, reset };
}

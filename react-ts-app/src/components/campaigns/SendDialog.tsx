import { useEffect, useRef, useState } from 'react';
import { fetchAudience } from '../../features/campaigns/campaignApi';
import { campaignErrors, SEND_FALLBACK } from '../../features/campaigns/campaignErrors';
import type { Audience, Campaign, CampaignSend } from '../../features/campaigns/campaignTypes';
import { ErrorBlock, ItemSkeleton } from '../organizations/portfolio/PortfolioSections';
import { QUIET } from '../organizations/portfolio/styles';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { BuilderDialog } from '../segments/BuilderDialog';
import { SendButton, SendStep } from './SendStep';
import { useSendNow } from './useSendNow';

type Load = { key: number; audience: Audience | null; error: string | null };

/** Send now… from the campaign's page (Decision 6): the editor's confirm
 *  step in the narrow builder dialog, on a count read when it opens. */
export function SendDialog({ campaign, onClose, onSent }: { campaign: Campaign; onClose: () => void; onSent: (send: CampaignSend) => void }) {
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load | null>(null);
  const sendNow = useSendNow({ submit: useSubmitOnce() });
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let alive = true;
    fetchAudience(campaign.id).then(
      (audience) => {
        if (alive) setLoad({ key: attempt, audience, error: null });
      },
      (err: unknown) => {
        if (alive) setLoad({ key: attempt, audience: null, error: Object.values(campaignErrors(err, 'Could not count who it reaches.'))[0] ?? SEND_FALLBACK });
      },
    );
    return () => {
      alive = false;
    };
  }, [campaign.id, attempt]);
  const current = load?.key === attempt ? load : null;
  const audience = current?.audience ?? null;
  useEffect(() => {
    if (audience) headingRef.current?.focus();
  }, [audience]);

  async function send() {
    const answer = await sendNow.send(campaign.id);
    if (answer && 'sent' in answer) onSent(answer.sent);
  }

  return (
    <BuilderDialog size="narrow" title={`Send ${campaign.name}`} onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
        {!current ? <ItemSkeleton count={1} label="Counting who it reaches" avatar={false} /> : null}
        {current?.error ? <ErrorBlock message={current.error} onRetry={() => setAttempt((n) => n + 1)} /> : null}
        {audience ? <SendStep name={campaign.name} audience={audience} headingRef={headingRef} /> : null}
      </div>
      <div className="flex flex-wrap items-start justify-end gap-2 border-t border-line-subtle px-4 py-3">
        <button type="button" onClick={onClose} className={QUIET}>
          Cancel
        </button>
        <SendButton busy={sendNow.busy} blocked={!audience || audience.reach === 0} refusal={sendNow.refusal} onSend={() => void send()} />
      </div>
    </BuilderDialog>
  );
}

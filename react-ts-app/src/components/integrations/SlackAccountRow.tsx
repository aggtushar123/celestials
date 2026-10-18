import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { fetchSlackLink, startSlackLink, unlinkSlack, type SlackLinkState } from '../../features/connectors/slackLink';
import { SLACK_LINK } from '../../features/connectors/connectionsText';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { ConnectionRow } from './ConnectionRow';
import { PROVIDER_LOGOS } from './providerLogos';
import { DANGER, FORM_ALERT, PRIMARY } from '../ui';

/** "Your accounts › Slack" (spec 2026-10-16 §3, Slack): the person's own
 *  Slack link, so replies they send from Revenact post as them and their
 *  channel messages are attributed to them. It asks Slack for no DM access.
 *  An older backend without the endpoint shows the row as not available. */
export function SlackAccountRow() {
  const [state, setState] = useState<SlackLinkState | null>(null);
  const [failed, setFailed] = useState(false);
  const [opening, setOpening] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(() => {
    fetchSlackLink()
      .then((next) => {
        // An older backend or a proxy page is not a link state: say not available.
        const valid = Boolean(next) && typeof next === 'object' && !Array.isArray(next) && 'configured' in next;
        setState(valid ? { ...next, link: next.link ?? null } : null);
        setFailed(!valid);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  async function link() {
    if (opening) return;
    setOpening(true);
    setRefused(null);
    try {
      const { authorize_url } = await startSlackLink();
      window.location.assign(authorize_url);
    } catch (e) {
      setOpening(false);
      setRefused(e instanceof ApiError && e.message ? e.message : SLACK_LINK.START_FAILED);
    }
  }

  const row = { id: 'slack-link', logo: PROVIDER_LOGOS.slack, name: SLACK_LINK.NAME, desc: SLACK_LINK.DESC };
  if (failed) return <ConnectionRow {...row} state={SLACK_LINK.UNAVAILABLE} />;
  if (state === null) return <ConnectionRow {...row} state="Loading…" />;

  const current = state.link;
  const refusal = refused ? (
    <p role="alert" className={FORM_ALERT}>
      {refused}
    </p>
  ) : null;
  const dialog = confirming ? (
    <ConfirmDialog
      title={SLACK_LINK.UNLINK_TITLE}
      message={SLACK_LINK.UNLINK_MESSAGE}
      confirmLabel={SLACK_LINK.UNLINK}
      onConfirm={async () => {
        try {
          await unlinkSlack();
        } catch (e) {
          throw e instanceof ApiError && e.message ? e.message : e;
        }
        load();
      }}
      onClose={() => setConfirming(false)}
    />
  ) : null;
  const extra = refusal || dialog ? (
    <>
      {refusal}
      {dialog}
    </>
  ) : null;
  const linkButton = (label: string) => (
    <button type="button" onClick={link} aria-disabled={opening || undefined} className={PRIMARY}>
      {opening ? SLACK_LINK.OPENING : label}
    </button>
  );

  if (current === null) {
    const canLink = state.configured && state.workspace_connected;
    const why = !state.configured ? SLACK_LINK.UNAVAILABLE : SLACK_LINK.NEEDS_WORKSPACE;
    return (
      <ConnectionRow {...row} state={canLink ? SLACK_LINK.NOT_LINKED : why} action={canLink ? linkButton(SLACK_LINK.LINK) : undefined}>
        {extra}
      </ConnectionRow>
    );
  }
  if (current.status === 'lost') {
    return (
      <ConnectionRow
        {...row}
        state={SLACK_LINK.LOST}
        stateTone="danger"
        action={linkButton(SLACK_LINK.LINK_AGAIN)}
        menu={[{ key: 'unlink', label: SLACK_LINK.UNLINK, onSelect: () => setConfirming(true), danger: true }]}
      >
        {extra}
      </ConnectionRow>
    );
  }
  return (
    <ConnectionRow
      {...row}
      state={`Linked as ${current.name}`}
      action={
        <button type="button" onClick={() => setConfirming(true)} className={DANGER}>
          {SLACK_LINK.UNLINK}
        </button>
      }
    >
      {extra}
    </ConnectionRow>
  );
}

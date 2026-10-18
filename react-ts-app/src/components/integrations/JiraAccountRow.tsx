import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { fetchJiraLink, startJiraLink, unlinkJira, type JiraLinkState } from '../../features/connectors/jiraLink';
import { JIRA_LINK, coversText, linkedAsText } from '../../features/connectors/jiraLinkText';
import { JIRA_ACCOUNT } from '../../features/connectors/connectionsText';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { ConnectionRow } from './ConnectionRow';
import { PROVIDER_LOGOS } from './providerLogos';
import { BUTTON, DANGER, FORM_ALERT, PRIMARY } from '../ui';

/** "Your accounts › Jira" (spec 2026-10-16 §3, Jira): the person's own
 *  Atlassian link, so the Jira steps they run act as them. Only the
 *  caller's link is ever shown. */
export function JiraAccountRow() {
  const [state, setState] = useState<JiraLinkState | null>(null);
  const [failed, setFailed] = useState(false);
  const [opening, setOpening] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(() => {
    fetchJiraLink()
      .then((next) => {
        setState(next);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  async function link() {
    if (opening) return;
    setOpening(true);
    setRefused(null);
    try {
      const { authorize_url } = await startJiraLink();
      // Stay busy while the browser leaves, so no second click starts another.
      window.location.assign(authorize_url);
    } catch (e) {
      setOpening(false);
      setRefused(e instanceof ApiError && e.message ? e.message : JIRA_LINK.START_FAILED);
    }
  }

  const row = { id: 'jira-link', logo: PROVIDER_LOGOS.jira, name: JIRA_ACCOUNT.NAME, desc: JIRA_ACCOUNT.DESC };
  if (failed) return <ConnectionRow {...row} state={JIRA_LINK.LOAD_FAILED} stateTone="danger" />;
  if (state === null) return <ConnectionRow {...row} state="Loading…" />;

  const current = state.link;
  const linkButton = (label: string, primary: boolean) => (
    <button type="button" onClick={link} aria-disabled={opening || undefined} className={primary ? PRIMARY : BUTTON}>
      {opening ? JIRA_LINK.OPENING : label}
    </button>
  );
  const refusal = refused ? (
    <p role="alert" className={FORM_ALERT}>
      {refused}
    </p>
  ) : null;
  const dialog = confirming ? (
    <ConfirmDialog
      title={JIRA_LINK.UNLINK_TITLE}
      message={JIRA_LINK.UNLINK_MESSAGE}
      confirmLabel={JIRA_LINK.UNLINK}
      onConfirm={async () => {
        try {
          await unlinkJira();
        } catch (e) {
          // ConfirmDialog shows string refusals only.
          throw e instanceof ApiError && e.message ? e.message : e;
        }
        load();
      }}
      onClose={() => setConfirming(false)}
    />
  ) : null;

  if (current === null) {
    const canLink = state.configured && state.connectors.length > 0;
    return (
      <ConnectionRow {...row} state={canLink ? 'Not linked' : JIRA_ACCOUNT.NEEDS_WORKSPACE} action={canLink ? linkButton('Link Jira', true) : undefined}>
        {refusal}
      </ConnectionRow>
    );
  }
  if (current.status === 'lost') {
    return (
      <ConnectionRow
        {...row}
        state={JIRA_LINK.LOST}
        stateTone="danger"
        action={linkButton(JIRA_LINK.LINK_AGAIN, true)}
        menu={[{ key: 'unlink', label: JIRA_LINK.UNLINK, onSelect: () => setConfirming(true), danger: true }]}
      >
        {refusal || dialog ? (
          <>
            {refusal}
            {dialog}
          </>
        ) : null}
      </ConnectionRow>
    );
  }
  return (
    <ConnectionRow
      {...row}
      state={`Linked as ${linkedAsText(current)} · ${coversText(state)}`}
      action={
        <button type="button" onClick={() => setConfirming(true)} className={DANGER}>
          {JIRA_LINK.UNLINK}
        </button>
      }
    >
      {refusal || dialog ? (
        <>
          {refusal}
          {dialog}
        </>
      ) : null}
    </ConnectionRow>
  );
}

import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { setConnectorAgents, type Connector } from '../../features/connectors/connectorsSlice';
import { AGENT_ACCESS, accessHint, accessLine } from '../../features/connectors/agentAccess';
import { BUTTON, FORM_ALERT, TYPE } from '../ui';

/** A connection's Read only / Can act (contract §5.3; frontend Decision 10). */
export function AgentAccess({ connector: given, canManage }: { connector: Connector; canManage: boolean }) {
  const dispatch = useAppDispatch();
  // The store's copy is the live one: a switch changes it in place.
  const connector = useAppSelector((state) => state.connectors.items.find((c) => c.id === given.id)) ?? given;
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const line = accessLine(connector);
  if (!line || !connector.agents) return null;
  const hint = accessHint(connector);
  const canAct = connector.agents.can_act;
  const broken = connector.agents.needs === 'reconnect';
  const switchable = canManage && connector.agents.kinds.length > 0 && !(broken && !canAct);

  async function change() {
    if (busy) return;
    setBusy(true);
    setRefused(null);
    const result = await dispatch(setConnectorAgents({ id: connector.id, canAct: !canAct }));
    if (setConnectorAgents.rejected.match(result)) {
      setBusy(false);
      return setRefused(result.payload ?? AGENT_ACCESS.FAILED);
    }
    // Slack's consent: stay busy while the browser leaves, so no second click starts another.
    if ('authorize_url' in result.payload) return window.location.assign(result.payload.authorize_url);
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className={TYPE.meta}>{line}</p>
        {switchable ? (
          <button type="button" onClick={change} aria-disabled={busy || undefined} className={BUTTON}>
            {busy ? (canAct ? AGENT_ACCESS.SAVING : AGENT_ACCESS.ALLOWING) : canAct ? AGENT_ACCESS.READ_ONLY : AGENT_ACCESS.ALLOW}
          </button>
        ) : null}
      </div>
      {hint && canManage && (broken || (!canAct && (switchable || connector.agents.kinds.length === 0))) ? <p className={TYPE.meta}>{hint}</p> : null}
      {refused ? (
        <p role="alert" className={FORM_ALERT}>
          {refused}
        </p>
      ) : null}
    </div>
  );
}

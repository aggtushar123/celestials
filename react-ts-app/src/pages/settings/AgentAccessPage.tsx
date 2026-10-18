// Settings > Developers > Agent access: keys for an agent that reads Revenact as you.
//
// The key is you. An agent holding it reads your book, your mail and your
// department's tickets, never more (see revenact-backend services/mcp).
// The secret is shown once, when it is made, because after that it exists
// only as a hash and nobody can recover it.

import { useEffect, useRef, useState } from 'react';
import { Bot, Check, Copy, KeyRound } from 'lucide-react';
import { ApiError } from '../../lib/apiClient';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { fetchAgentTokens, issueAgentToken, revokeAgentToken } from '../../features/agents/agentAccessApi';
import type { AgentToken, IssuedToken } from '../../features/agents/agentAccessApi';
import { BUTTON, CODE, DANGER, EmptyState, ErrorState, IconChip, INPUT, LoadingState, MetaParts, PRIMARY, ROW_ACTIONS, SettingsFrame, SettingsNote, SettingsRow, SettingsSection, TYPE } from '../../components/ui';
import { settingsTitle } from './workspaceSettingsNav';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function AgentAccessPage() {
  const [attempt, setAttempt] = useState(0);
  const [tokens, setTokens] = useState<AgentToken[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<IssuedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<AgentToken | null>(null);

  // Focus that has to wait for the next render, because the control that held
  // it unmounts (a revoked row, the key card once it is dismissed).
  const labelRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const issuedHeadingRef = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<(() => void) | null>(null);
  useEffect(() => {
    const run = pendingFocus.current;
    pendingFocus.current = null;
    run?.();
  });

  useEffect(() => {
    let cancelled = false;
    fetchAgentTokens()
      .then((rows) => {
        if (cancelled) return;
        if (!Array.isArray(rows)) throw new Error('unexpected response');
        setTokens(rows);
        setLoadError(null);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorText(err, 'Could not load your keys.'));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  async function create() {
    if (!label.trim() || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      setIssued(await issueAgentToken(label.trim()));
      setLabel('');
      // The key card appears and the field is cleared: say so, from the card's heading.
      pendingFocus.current = () => issuedHeadingRef.current?.focus();
      setAttempt((n) => n + 1);
    } catch (err) {
      setActionError(errorText(err, 'Could not create a key.'));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!revoking) return;
    const target = revoking;
    setRevoking(null);
    setActionError(null);
    try {
      await revokeAgentToken(target.id);
      setTokens((current) => (current ? current.filter((t) => t.id !== target.id) : current));
      // The row's Revoke is gone: the list takes focus, or the name field when no key is left.
      pendingFocus.current = () => (listRef.current ?? labelRef.current)?.focus();
      setAttempt((n) => n + 1);
    } catch (err) {
      setActionError(errorText(err, 'Could not revoke that key.'));
    }
  }

  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <SettingsFrame
      title={settingsTitle('/settings/developers/agent-access')}
      intro="Let an agent read Revenact as you, over MCP. It sees exactly what you see in the app: your book, your mail, your department's tickets. It cannot change anything."
      note={
        <SettingsNote>
          Point the agent at <code className={`${CODE} text-ink`}>/api/v1/mcp/</code> and give it the key as a bearer token.
        </SettingsNote>
      }
    >
      {actionError ? (
        <p role="alert" className="text-[13px] leading-5 text-danger-ink">
          {actionError}
        </p>
      ) : null}

      {issued ? (
        <SettingsSection
          title="Your new key"
          headingRef={issuedHeadingRef}
          description={`The key for ${issued.label}.`}
          footer={
            <button
              type="button"
              onClick={() => {
                setIssued(null);
                setCopied(false);
                pendingFocus.current = () => labelRef.current?.focus();
              }}
              className={BUTTON}
            >
              Done
            </button>
          }
        >
          <div className="flex flex-col gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <code className={`grow break-all rounded-lg bg-subtle px-3 py-2 ${TYPE.body} ${CODE}`}>{issued.token}</code>
              <button type="button" onClick={() => void copy()} className={BUTTON}>
                {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <SettingsNote icon="warning">This is the only time it can be shown. Nobody can recover it afterwards, not even an admin; if it is lost, make another and revoke this one.</SettingsNote>
          </div>
        </SettingsSection>
      ) : null}

      <form
        aria-label="New key"
        onSubmit={(event) => {
          event.preventDefault();
          if (label.trim() && !busy) void create();
        }}
      >
        <SettingsSection
          title="New key"
          footer={
            <>
              {/* Always mounted: the wait is announced, and its end. */}
              <p role="status" className={`mr-auto ${TYPE.bodyMuted}`}>
                {busy ? 'Creating…' : ''}
              </p>
              <button type="submit" aria-disabled={!label.trim() || busy || undefined} className={PRIMARY}>
                Create a key
              </button>
            </>
          }
        >
          <SettingsRow label="What is it for" htmlFor="agent-label">
            <input ref={labelRef} id="agent-label" type="text" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Claude Desktop" className={INPUT} />
          </SettingsRow>
        </SettingsSection>
      </form>

      <SettingsSection
        title="Keys"
        list="Agent keys"
        listRef={listRef}
        state={
          loadError ? (
            <ErrorState message={loadError} onRetry={() => setAttempt((n) => n + 1)} />
          ) : tokens === null ? (
            <LoadingState label="Loading your keys" count={1} />
          ) : tokens.length === 0 ? (
            <EmptyState icon={Bot} title="No agent has access yet." />
          ) : undefined
        }
      >
        {(tokens ?? []).map((token) => (
          <li key={token.id} className="group relative flex min-h-14 items-center gap-3 px-4 py-3">
            <IconChip icon={KeyRound} />
            <div className="flex min-w-0 flex-1 flex-col">
              <p title={token.label} className={`${TYPE.body} truncate font-semibold`}>
                {token.label}
              </p>
              <p className={TYPE.meta}>
                <MetaParts
                  parts={[
                    <>
                      Ends <span className={CODE}>{token.hint}</span>
                    </>,
                    `made ${shortDate(token.created_at)}`,
                    token.last_used_at ? `Last used ${shortDate(token.last_used_at)}` : 'Never used',
                  ]}
                />
              </p>
            </div>
            <div className={ROW_ACTIONS}>
              <button type="button" onClick={() => setRevoking(token)} aria-label={`Revoke ${token.label}`} className={DANGER}>
                Revoke
              </button>
            </div>
          </li>
        ))}
      </SettingsSection>

      {revoking && (
        <ConfirmDialog
          title={`Revoke ${revoking.label}?`}
          message="Anything using this key stops working immediately. This cannot be undone."
          confirmLabel="Revoke"
          danger
          onConfirm={revoke}
          onClose={() => setRevoking(null)}
        />
      )}
    </SettingsFrame>
  );
}

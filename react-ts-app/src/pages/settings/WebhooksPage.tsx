import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, CheckCircle2, XCircle, ChevronDown } from 'lucide-react';
import { useCapability } from '../../hooks';
import { formatRelativeTime } from '../../features/customers/formatters';
import { ApiError } from '../../lib/apiClient';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { createWebhook, deleteWebhook, fetchWebhooks, updateWebhook } from './webhooksApi';
import type { Webhook } from './webhooksApi';
import { BUTTON, CODE, EmptyState, ErrorState, ICON_BUTTON, INPUT, INVALID, LoadingState, MetaParts, NUM, PRIMARY, QUIET, ROW_ACTIONS, SettingsFrame, SettingsNote, SettingsRow, SettingsSection, Switch, TYPE } from '../../components/ui';
import { settingsTitle } from './workspaceSettingsNav';

// Backs Settings > Webhooks. Viewing and changing both need manage_integrations
// server-side (IsOrgAdmin on GET too), so a member gets a notice and no fetch.
export function WebhooksPage() {
  const isAdmin = useCapability('manage_integrations');

  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [isLoading, setIsLoading] = useState(isAdmin);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null);
  const [attempt, setAttempt] = useState(0);
  // A refused On/Off, shown in its own row; the switch keeps the saved state.
  const [toggleError, setToggleError] = useState<{ id: number; message: string } | null>(null);
  // Read synchronously, so a double press sends one PATCH.
  const toggling = useRef(new Set<number>());

  const [showAddForm, setShowAddForm] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Focus that has to wait for the next render, because the control that held
  // it unmounts (the Add webhook opener, the form, a deleted row).
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const endpointsRef = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<(() => void) | null>(null);
  const deleted = useRef(false);
  useEffect(() => {
    const run = pendingFocus.current;
    pendingFocus.current = null;
    run?.();
  });
  function focusAddWebhook() {
    pendingFocus.current = () => addButtonRef.current?.focus();
  }

  useEffect(() => {
    if (!isAdmin) return;

    async function load() {
      try {
        setWebhooks(await fetchWebhooks());
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : 'Could not load webhooks.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [isAdmin, attempt]);

  async function handleAdd() {
    setAddError(null);
    setIsSubmitting(true);
    try {
      const created = await createWebhook({ url: newUrl, event: 'customer.created' });
      setWebhooks((current) => [created, ...current]);
      setNewUrl('');
      setShowAddForm(false);
      focusAddWebhook();
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Could not create webhook.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function cancelAdd() {
    setShowAddForm(false);
    setAddError(null);
    setNewUrl('');
    focusAddWebhook();
  }

  async function toggleActive(webhook: Webhook) {
    if (toggling.current.has(webhook.id)) return;
    toggling.current.add(webhook.id);
    setToggleError(null);
    try {
      const updated = await updateWebhook(webhook.id, { is_active: !webhook.is_active });
      setWebhooks((current) => current.map((w) => (w.id === webhook.id ? updated : w)));
    } catch (err) {
      setToggleError({ id: webhook.id, message: err instanceof ApiError ? err.message : 'Could not change this webhook.' });
    } finally {
      toggling.current.delete(webhook.id);
    }
  }

  const title = settingsTitle('/settings/developers/webhooks');
  if (!isAdmin) {
    return (
      <SettingsFrame title={title} intro="Outbound integrations for this organisation." note={<SettingsNote icon="lock">You don't have permission to view or manage webhooks.</SettingsNote>}>
        {null}
      </SettingsFrame>
    );
  }

  return (
    <SettingsFrame
      title={title}
      intro="Get notified at a URL of your choosing when something happens in Revenact."
      action={
        showAddForm ? undefined : (
          <button ref={addButtonRef} type="button" onClick={() => setShowAddForm(true)} className={BUTTON}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add webhook
          </button>
        )
      }
    >
      {showAddForm ? (
        <form
          aria-label="New webhook"
          onSubmit={(event) => {
            event.preventDefault();
            if (newUrl.trim() && !isSubmitting) void handleAdd();
          }}
        >
          <SettingsSection
            title="New webhook"
            footer={
              <>
                <button type="button" onClick={cancelAdd} className={QUIET}>
                  Cancel
                </button>
                <button type="submit" aria-disabled={!newUrl.trim() || isSubmitting || undefined} className={PRIMARY}>
                  {isSubmitting ? 'Adding…' : 'Add'}
                </button>
              </>
            }
          >
            <SettingsRow label="URL" htmlFor="webhook-url" hint="Sends when: Organization created" hintId="webhook-url-hint" error={addError ?? undefined} errorId="webhook-url-error" stacked>
              <input
                id="webhook-url"
                type="url"
                value={newUrl}
                onChange={(event) => setNewUrl(event.target.value)}
                placeholder="https://example.com/hooks/revenact"
                autoFocus
                aria-invalid={Boolean(addError)}
                aria-describedby={addError ? 'webhook-url-hint webhook-url-error' : 'webhook-url-hint'}
                className={`${INPUT} ${INVALID} ${CODE}`}
              />
            </SettingsRow>
          </SettingsSection>
        </form>
      ) : null}

      <SettingsSection
        title="Endpoints"
        headingRef={endpointsRef}
        list="Webhooks"
        listRef={listRef}
        state={
          isLoading ? (
            <LoadingState label="Loading webhooks" count={2} />
          ) : loadError ? (
            <ErrorState
              message={loadError}
              onRetry={() => {
                setLoadError(null);
                setIsLoading(true);
                setAttempt((n) => n + 1);
              }}
            />
          ) : webhooks.length === 0 ? (
            <EmptyState title="No webhooks yet." detail="Add one to get notified when an organization is created." />
          ) : undefined
        }
      >
        {webhooks.map((webhook) => {
          const open = expandedId === webhook.id;
          const panelId = `webhook-${webhook.id}-deliveries`;
          return (
            <li key={webhook.id} className="group relative flex flex-col">
              <div className="flex min-h-14 items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={open ? panelId : undefined}
                    onClick={() => setExpandedId((id) => (id === webhook.id ? null : webhook.id))}
                    className="flex min-h-11 min-w-0 items-center gap-1.5 rounded-sm text-left sm:min-h-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <ChevronDown className={`h-4 w-4 shrink-0 text-ink-muted ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                    <span title={webhook.url} className={`${TYPE.body} ${CODE} truncate font-semibold`}>
                      {webhook.url}
                    </span>
                  </button>
                  <p className={TYPE.meta}>
                    <MetaParts parts={[webhook.event_display, `added ${formatRelativeTime(webhook.created_at)}`]} />
                  </p>
                </div>
                <Switch checked={webhook.is_active} label={`Webhook for ${webhook.url}`} onChange={() => void toggleActive(webhook)}>
                  {webhook.is_active ? 'On' : 'Off'}
                </Switch>
                <div className={ROW_ACTIONS}>
                  <button type="button" onClick={() => setDeleteTarget(webhook)} aria-label={`Delete webhook for ${webhook.url}`} className={ICON_BUTTON}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {toggleError?.id === webhook.id ? (
                <p role="alert" className="px-4 pb-3 text-[13px] leading-5 text-danger-ink">
                  {toggleError.message}
                </p>
              ) : null}
              {open ? (
                <div id={panelId} className="flex flex-col gap-2 border-t border-line-subtle px-4 py-3">
                  <p className={TYPE.label}>Recent deliveries</p>
                  {webhook.recent_deliveries.length === 0 ? (
                    <p className={TYPE.bodyMuted}>No deliveries yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {webhook.recent_deliveries.map((delivery) => (
                        <li key={delivery.id} className={`flex items-center gap-2 ${TYPE.bodyMuted}`}>
                          {delivery.success ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                          ) : (
                            <XCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                          )}
                          <span className="sr-only">{delivery.success ? 'Delivered' : 'Failed'}</span>
                          <MetaParts
                            parts={[
                              formatRelativeTime(delivery.sent_at),
                              delivery.status_code ? (
                                <>
                                  HTTP <span className={NUM}>{delivery.status_code}</span>
                                </>
                              ) : null,
                              delivery.error ? <span className="break-words text-[13px] leading-5 text-danger-ink">{delivery.error}</span> : null,
                            ]}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </SettingsSection>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this webhook?"
          message="This can't be undone: Revenact stops notifying this URL."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await deleteWebhook(deleteTarget.id);
            setWebhooks((current) => current.filter((w) => w.id !== deleteTarget.id));
            deleted.current = true;
          }}
          onClose={() => {
            if (deleted.current) {
              deleted.current = false;
              // The row is gone: the list takes focus, or Add webhook when none are
              // left; with the form open (no opener) the Endpoints heading.
              pendingFocus.current = () => (listRef.current ?? addButtonRef.current ?? endpointsRef.current)?.focus();
            }
            setDeleteTarget(null);
          }}
        />
      )}
    </SettingsFrame>
  );
}

import { useEffect, useRef, useState } from 'react';
import { CHANNELS, channelMeta, eventsLine, fetchSlackChannels, readChannelRefusal, updateSlackChannel, type ChannelChange, type SlackChannelList, type SlackChannelRow } from '../../features/connectors/slackChannels';
import type { RecordRef } from '../../features/plans/planTypes';
import { ChannelCustomerForm } from '../../pages/integrations/ChannelCustomerForm';
import { EmptyState, ErrorState, FIELD_ERROR, LoadingState, MetaParts, QUIET, SearchInput, Switch, TYPE } from '../ui';

const MANY = 8;

const refOf = (row: SlackChannelRow): RecordRef | null =>
  row.record ? { kind: row.record.type === 'customer' ? 'organization' : 'account', id: row.record.id, name: row.record.name } : null;

/** A Slack connection's channels (Slack escalations D3 frontend Decisions 2
 *  to 4): every public channel, Sync on or off, and each one's customer.
 *  The list is the panel's own; `onChanged` lets the row refresh its counts. */
export function SlackChannelsPanel({ connectorId, onReconnect, onChanged, onDone }: { connectorId: number; onReconnect: () => void; onChanged: () => void; onDone: () => void }) {
  const [list, setList] = useState<SlackChannelList | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const busyRows = useRef(new Set<string>());
  const [open, setOpen] = useState<string | null>(null);
  const [refusals, setRefusals] = useState<Record<string, string>>({});
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchSlackChannels(connectorId)
      .then((next) => live && setList(next))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [connectorId, tries]);

  function retry() {
    setFailed(false);
    setList(null);
    setTries((n) => n + 1);
  }

  const customerButtonId = (id: string) => `channel-customer-${connectorId}-${id}`;
  const setRowBusy = (id: string, on: boolean) => {
    if (on) busyRows.current.add(id);
    else busyRows.current.delete(id);
    setBusy((b) => ({ ...b, [id]: on }));
  };

  async function change(row: SlackChannelRow, body: ChannelChange, words: string, underRow = true): Promise<string | null> {
    // One save at a time per channel: the switch and the form share it.
    if (busyRows.current.has(row.id)) return underRow ? null : CHANNELS.BUSY;
    setRowBusy(row.id, true);
    setSaid(null);
    setRefusals((r) => ({ ...r, [row.id]: '' }));
    try {
      const next = await updateSlackChannel(connectorId, row.id, body);
      setList((l) => (l ? { ...l, channels: l.channels.map((c) => (c.id === next.id ? next : c)), synced: l.channels.filter((c) => (c.id === next.id ? next.included : c.included)).length } : l));
      setSaid(words);
      onChanged();
      return null;
    } catch (err) {
      const sentence = readChannelRefusal(err);
      // A form shows its own refusal; only a switch's goes under the row.
      if (underRow) setRefusals((r) => ({ ...r, [row.id]: sentence }));
      return sentence;
    } finally {
      setRowBusy(row.id, false);
    }
  }

  const doneButton = (
    <div>
      <button type="button" onClick={onDone} className={QUIET}>
        {CHANNELS.DONE}
      </button>
    </div>
  );
  if (failed)
    return (
      <div className="flex flex-col gap-3">
        <ErrorState message={CHANNELS.LOAD_FAILED} onRetry={retry} />
        {doneButton}
      </div>
    );
  if (!list) return <LoadingState label={CHANNELS.LOADING} variant="rows" count={3} />;
  if (list.channels.length === 0)
    return (
      <div className="flex flex-col gap-3">
        <EmptyState title={CHANNELS.EMPTY} detail={CHANNELS.EMPTY_DETAIL} size="section" />
        {doneButton}
      </div>
    );

  const needle = query.trim().toLowerCase();
  const shown = needle ? list.channels.filter((c) => c.name.toLowerCase().includes(needle)) : list.channels;
  return (
    <section aria-label={CHANNELS.HEADING} className="flex flex-col gap-3">
      <p className={TYPE.body}>{CHANNELS.summary(list.synced, list.total)}</p>
      <p className={TYPE.meta}>{eventsLine(list.events_at)}</p>
      {!list.can_join ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className={`${TYPE.meta} max-w-[68ch]`}>{CHANNELS.CANT_JOIN}</p>
          <button type="button" onClick={onReconnect} className={QUIET}>
            {CHANNELS.APPROVE}
          </button>
        </div>
      ) : null}
      <p role="status" className={said ? TYPE.meta : 'sr-only'}>
        {said}
      </p>
      {list.channels.length > MANY ? <SearchInput label={CHANNELS.FIND} placeholder={CHANNELS.FIND_PLACEHOLDER} value={query} onChange={setQuery} width="full" /> : null}
      {shown.length === 0 ? (
        <p className={TYPE.bodyMuted}>{CHANNELS.NONE_FOUND}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {shown.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className={`${TYPE.body} font-semibold`}>#{row.name}</span>
                  <span className={TYPE.meta}>
                    <MetaParts parts={channelMeta(row, list.can_join)} />
                  </span>
                </div>
                <Switch
                  checked={row.included}
                  label={CHANNELS.syncLabel(row.name)}
                  busy={Boolean(busy[row.id])}
                  onChange={(next) => void change(row, { included: next }, next ? CHANNELS.nowSyncing(row.name) : CHANNELS.stopped(row.name))}
                />
                <button type="button" id={customerButtonId(row.id)} aria-label={CHANNELS.customerLabel(row.name)} aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? null : row.id)} className={QUIET}>
                  {CHANNELS.CUSTOMER}
                </button>
              </div>
              {refusals[row.id] ? (
                <p role="alert" className={FIELD_ERROR}>
                  {refusals[row.id]}
                </p>
              ) : null}
              {open === row.id ? (
                <ChannelCustomerForm
                  subject={`#${row.name}`}
                  current={refOf(row)}
                  onSave={(record) =>
                    change(
                      row,
                      { record: record ? { type: record.kind === 'organization' ? 'customer' : 'account', id: record.id } : null },
                      record ? CHANNELS.filesUnder(row.name, record.name) : CHANNELS.filesByName(row.name),
                      false,
                    )
                  }
                  onDone={() => {
                    setOpen(null);
                    document.getElementById(customerButtonId(row.id))?.focus();
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" onClick={onDone} className={QUIET}>
          {CHANNELS.DONE}
        </button>
      </div>
    </section>
  );
}

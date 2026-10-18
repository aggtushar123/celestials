import { useState } from 'react';
import { Link } from 'react-router-dom';
import { changeText, driverFilter, graphHref, handoverText, nothingMoved, SAY, toneOf, valueText } from '../../features/brain/brainText';
import type { ChangedPayload, ChangedSignal } from '../../features/brain/brainTypes';
import { BUTTON, EmptyState, FOCUS, ListCard, NUM, TYPE } from '../ui';
import { TONE_CLASS } from './styles';
import { WhyPanel } from './WhyPanel';

const DRIVER_LINK = `inline-flex min-h-11 items-center font-semibold text-ink underline-offset-2 hover:underline sm:min-h-0 ${FOCUS}`;

/** What moved materially (spec §2.3 item 3), in the server's order (bad news
 *  first). Why? opens one explanation at a time, inline under its row. */
export function MovesList({ changed, onRefused }: { changed: ChangedPayload; onRefused: (err: unknown) => boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section aria-labelledby="moves-heading" className="flex flex-col gap-2">
      {/* Same heading row as ScopeBriefCard's, so the two cards in What
          changed's pair start level. */}
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        <h2 id="moves-heading" className={TYPE.title}>
          {SAY.MOVED}
        </h2>
      </div>
      {changed.signals.length === 0 ? (
        <ListCard label={SAY.MOVED} state={<EmptyState size="inline" title={nothingMoved(changed.since)} />} />
      ) : (
        <ListCard label={SAY.MOVED}>
          {changed.signals.map((signal) => (
            <MoveRow
              key={signal.key}
              signal={signal}
              changed={changed}
              open={open === signal.key}
              onToggle={() => setOpen(open === signal.key ? null : signal.key)}
              onRefused={onRefused}
            />
          ))}
        </ListCard>
      )}
    </section>
  );
}

function MoveRow({
  signal,
  changed,
  open,
  onToggle,
  onRefused,
}: {
  signal: ChangedSignal;
  changed: ChangedPayload;
  open: boolean;
  onToggle: () => void;
  onRefused: (err: unknown) => boolean;
}) {
  const { unit } = signal;
  const driver = signal.drivers[0] ?? null;
  const filter = driver ? driverFilter(driver) : null;
  const handover = handoverText(signal.handover);
  return (
    <li>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className={`${TYPE.body} font-semibold`}>{signal.label}</p>
          <p className={`flex flex-wrap items-baseline gap-x-2 ${TYPE.bodyMuted}`}>
            <span className={NUM}>
              {valueText(unit, signal.then, changed.currency)}
              <span aria-hidden="true"> → </span>
              <span className="sr-only"> to </span>
              <span className="text-ink">{valueText(unit, signal.now, changed.currency)}</span>
            </span>
            <span className={`${NUM} font-semibold ${TONE_CLASS[toneOf(signal.better, signal.change, signal.improved)]}`}>
              {changeText(unit, signal.change, changed.currency)}
            </span>
          </p>
          {driver || handover ? (
            <p className={TYPE.meta}>
              {driver ? (
                <>
                  most of it:{' '}
                  {filter ? (
                    <Link to={graphHref(changed.scope, filter)} aria-label={`${driver.label} on the knowledge graph`} className={DRIVER_LINK}>
                      {driver.label}
                    </Link>
                  ) : (
                    driver.label
                  )}
                </>
              ) : null}
              {driver && handover ? ' · ' : null}
              {handover}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={`Why? ${signal.label}`}
          aria-expanded={open}
          aria-controls={open ? `why-${signal.key}` : undefined}
          onClick={onToggle}
          className={BUTTON}
        >
          Why?
        </button>
      </div>
      {open ? <WhyPanel metric={signal.key} label={signal.label} scope={changed.scope} onRefused={onRefused} /> : null}
    </li>
  );
}

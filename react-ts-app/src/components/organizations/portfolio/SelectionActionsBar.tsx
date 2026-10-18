// Exports the bar and the value its date choice's "Clear" arms.
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, X } from 'lucide-react';
import type { PortfolioNoun } from '../../../features/organizations/portfolioLabels';
import type { Option } from '../../../features/organizations/portfolioTypes';
import { BUTTON, FOCUS } from './styles';
import { ICON_BUTTON, NUM, OVERLAY, PRIMARY } from '../../ui';

export interface BulkReport {
  updated: number;
  failed: { id: number; name: string; reason: string }[];
  /** The request itself failed; nothing was applied. */
  error?: string;
}

/** One bulk edit offered as a select: its label is the select's name and
 *  its empty option ("Change owner", "Set stage"). */
export interface BulkChoice {
  key: string;
  label: string;
  options: Option[];
}

/** A bulk date: a date input, and a button that arms clearing it. */
export interface BulkDateChoice {
  key: string;
  label: string;
  clearLabel: string;
}

/** What a date choice's clear button arms (a date input never produces it). */
export const CLEAR_DATE = 'clear';

type Pending = { key: string; value: string };

function reportText(report: BulkReport, noun: PortfolioNoun): string {
  return `Updated ${report.updated} ${report.updated === 1 ? noun.one : noun.many}.${report.failed.length ? ` ${report.failed.length} failed:` : ''}`;
}

/** Selection mode's action bar (Organizations spec §1), for any portfolio:
 *  it sticks to the bottom of the content column. No choice acts on its
 *  control's own change (a closed select fires one per arrow key on Windows
 *  and Firefox): a choice arms "Apply to N" beside it, and that button runs
 *  it. One choice is armed at a time. The live regions stay mounted whether
 *  or not the bar shows, so only their text changes. */
export function SelectionActionsBar({
  count,
  noun,
  choices,
  dateChoice,
  activity,
  loading = false,
  report,
  onApply,
  onExport,
  extra,
  onClose,
}: {
  count: number;
  noun: PortfolioNoun;
  choices: BulkChoice[];
  dateChoice?: BulkDateChoice;
  /** What is running: controls disable and the bar says so. */
  activity: 'applying' | 'exporting' | null;
  /** The list is reloading: controls disable, with nothing claimed. */
  loading?: boolean;
  report: BulkReport | null;
  /** A choice's key and the armed value (`CLEAR_DATE` for a cleared date). */
  onApply: (key: string, value: string) => void;
  onExport: () => void;
  /** More buttons after Export (Organizations' Archive and Churn). */
  extra?: (disabled: boolean) => ReactNode;
  onClose: () => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  // An armed choice never outlives the selection it was armed for.
  if (count === 0 && pending) setPending(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  // A finished action lands focus on its report (or the bar), never on the
  // page body: the control was disabled and Apply unmounted meanwhile.
  useEffect(() => {
    if (report) (reportRef.current ?? regionRef.current)?.focus();
  }, [report]);

  const disabled = activity !== null || loading;
  const busyText = activity === 'applying' ? 'Applying…' : activity === 'exporting' ? 'Exporting…' : '';
  const announcement = busyText || (count > 0 ? `${count} selected` : '');

  const apply = () => {
    if (!pending) return;
    onApply(pending.key, pending.value);
    setPending(null);
    regionRef.current?.focus();
  };

  const choose = (key: string) => (event: { target: { value: string } }) =>
    setPending(event.target.value ? { key, value: event.target.value } : null);

  const applyButton = (key: string) =>
    pending?.key === key ? (
      <button type="button" onClick={apply} disabled={disabled} className={PRIMARY}>
        Apply to <span className={NUM}>{count}</span>
      </button>
    ) : null;

  const visible = count > 0 || report !== null;
  const clearing = dateChoice !== undefined && pending?.key === dateChoice.key && pending.value === CLEAR_DATE;

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <p role="alert" className="sr-only">
        {report?.error ?? ''}
      </p>
      {visible ? (
        <div
          ref={regionRef}
          tabIndex={-1}
          role="region"
          aria-label="Selection"
          className={`sticky bottom-3 z-20 flex flex-col gap-2 px-4 py-2 ${OVERLAY} ${FOCUS}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            {count > 0 ? (
              <>
                <p className="text-[13px] font-semibold text-ink">
                  <span className={NUM}>{count}</span> selected
                </p>
                {choices.map((choice) => (
                  <Fragment key={choice.key}>
                    <select
                      aria-label={choice.label}
                      value={pending?.key === choice.key ? pending.value : ''}
                      disabled={disabled}
                      onChange={choose(choice.key)}
                      className={BUTTON}
                    >
                      <option value="">{choice.label}</option>
                      {choice.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    {applyButton(choice.key)}
                  </Fragment>
                ))}
                {dateChoice ? (
                  <>
                    <input
                      type="date"
                      aria-label={dateChoice.label}
                      value={pending?.key === dateChoice.key && !clearing ? pending.value : ''}
                      disabled={disabled}
                      onChange={choose(dateChoice.key)}
                      className={BUTTON}
                    />
                    <button
                      type="button"
                      aria-pressed={clearing}
                      disabled={disabled}
                      onClick={() => setPending({ key: dateChoice.key, value: CLEAR_DATE })}
                      className={`${BUTTON} ${clearing ? 'bg-accent-dim' : ''}`}
                    >
                      {dateChoice.clearLabel}
                    </button>
                    {applyButton(dateChoice.key)}
                  </>
                ) : null}
                <button type="button" onClick={onExport} disabled={disabled} className={BUTTON}>
                  <Download className="w-4 h-4" aria-hidden="true" />
                  Export
                </button>
                {extra?.(disabled)}
              </>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label={count > 0 ? 'Clear selection' : 'Dismiss'}
              className={`ml-auto ${ICON_BUTTON}`}
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          {busyText ? (
            <p aria-hidden="true" className="text-[11px] text-ink-muted">
              {busyText}
            </p>
          ) : null}
          {report ? (
            <div ref={reportRef} tabIndex={-1} className={`rounded-md text-[13px] ${FOCUS}`}>
              {report.error ? <p className="text-danger-ink">{report.error}</p> : <p className="text-ink">{reportText(report, noun)}</p>}
              {report.failed.length ? (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {report.failed.map((failure) => (
                    <li key={failure.id} className="text-[11px] text-danger-ink">
                      <span className="font-semibold">{failure.name}</span>: {failure.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

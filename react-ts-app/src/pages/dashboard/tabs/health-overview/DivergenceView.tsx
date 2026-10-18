import { useMemo, useState } from 'react';
import { useHealthOverview } from './useHealthOverview';
import { HealthEmpty, HealthError, HealthLoading, HealthTruncatedNotice } from './HealthDataState';
import { layOut, splitDivergent, summariseDivergence, DIVERGENCE_THRESHOLD } from './divergence';
import { PulseDivergenceScatter } from './charts/PulseDivergenceScatter';
import { DivergenceList } from './charts/DivergenceList';
import { useDrill } from '../../drill/useDrill';
import { fromHealthRows } from '../../drill/rows';
import { ScrollArea } from '../../shared/ScrollTable';

/** Underlined, inline with the sentence, same colour as the number it
 *  replaces — a drill trigger, not a link, so it gets an explicit
 *  accessible name rather than relying on visible digits alone. */
const NUMBER_BUTTON = 'underline underline-offset-2 rounded-sm hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

/** A drill trigger when the book behind it supports one, otherwise the same
 *  number as plain text — an underlined, hoverable number that goes nowhere
 *  would be its own small lie about a truncated book. */
function DrillNumber({
  drillable,
  label,
  value,
  tone,
  onOpen,
}: {
  drillable: boolean;
  label: string;
  value: number;
  tone: string;
  onOpen: (trigger: HTMLElement) => void;
}) {
  if (!drillable) return <span className={tone}>{value}</span>;
  return (
    <button
      type="button"
      aria-label={`${label} ${value}, show accounts`}
      onClick={(e) => onOpen(e.currentTarget)}
      className={`${tone} ${NUMBER_BUTTON}`}
    >
      {value}
    </button>
  );
}

/**
 * Health Overview asked the other way round: not how the book is doing, but
 * where the team's read on it might be wrong.
 *
 * Everything here comes off `csmPulseScore` and `aiPulseScore`, both of which
 * the Controls tab already renders — as two separate bar charts that never
 * touch. Putting them on the same pair of axes is the entire feature.
 */
export function DivergenceView() {
  // Pinned at mount so renewal countdowns don't drift between renders.
  const [now] = useState(() => new Date());
  const { open } = useDrill();

  const { rows, error, truncated, isInitialLoad, hasLoaded } = useHealthOverview();

  // A truncated book is a capped slice of a larger one — a drill from it
  // would only ever show *some* of the accounts a number counted, so every
  // number below stops offering one rather than quietly lying.
  const drillable = !truncated;

  const laid = useMemo(() => layOut(rows, now), [rows, now]);
  const summary = useMemo(() => summariseDivergence(laid), [laid]);
  const { aiColder, csmColder } = useMemo(() => splitDivergent(laid), [laid]);

  // Same three predicates the headline sentence counts, kept as row lists so
  // each number can open exactly the accounts it counted.
  const disagreeingRows = useMemo(
    () => laid.filter((d) => d.kind === 'ai-colder' || d.kind === 'csm-colder'),
    [laid],
  );
  const urgentBlindSpotRows = useMemo(
    () => laid.filter((d) => d.kind === 'ai-colder' && d.daysToRenewal !== null && d.daysToRenewal <= 90),
    [laid],
  );
  const unratedRows = useMemo(() => laid.filter((d) => d.kind === 'unrated'), [laid]);

  if (isInitialLoad) return <HealthLoading />;
  if (error) return <HealthError message={error} />;
  if (hasLoaded && rows.length === 0) return <HealthEmpty />;

  return (
    <div className="w-full flex flex-col gap-4 pb-12">
      {truncated && <HealthTruncatedNotice />}
      <p className="px-2 text-[11.5px] text-ink-muted">
        <DrillNumber
          drillable={drillable}
          label="Disagreeing"
          value={summary.disagreeing}
          tone="font-bold text-ink"
          onOpen={(trigger) =>
            open(
              {
                title: 'Disagreeing',
                figure: String(summary.disagreeing),
                source: { kind: 'rows', rows: fromHealthRows(disagreeingRows.map((d) => d.row)) },
              },
              trigger,
            )
          }
        />{' '}
        of {summary.total} accounts have a CSM and AI pulse {DIVERGENCE_THRESHOLD}+ points apart
        {summary.urgentBlindSpots > 0 && (
          <>
            {' '}—{' '}
            <DrillNumber
              drillable={drillable}
              label="Urgent blind spots"
              value={summary.urgentBlindSpots}
              tone="font-bold text-danger"
              onOpen={(trigger) =>
                open(
                  {
                    title: 'Urgent blind spots',
                    figure: String(summary.urgentBlindSpots),
                    source: { kind: 'rows', rows: fromHealthRows(urgentBlindSpotRows.map((d) => d.row)) },
                  },
                  trigger,
                )
              }
            />{' '}
            of those renew inside 90 days with the AI reading colder
          </>
        )}
        .
        {summary.unrated > 0 && (
          <>
            {' '}
            <span className="text-ink-faint">
              <DrillNumber
                drillable={drillable}
                label="Unrated"
                value={summary.unrated}
                tone=""
                onOpen={(trigger) =>
                  open(
                    {
                      title: 'Unrated',
                      figure: String(summary.unrated),
                      source: { kind: 'rows', rows: fromHealthRows(unratedRows.map((d) => d.row)) },
                    },
                    trigger,
                  )
                }
              />{' '}
              not plotted — one side hasn’t rated them.
            </span>
          </>
        )}
      </p>

      <div className="flex flex-col xl:flex-row gap-4 items-stretch [&>*]:min-w-0">
        {/* Definite height, not min-height: the scatter's ResponsiveContainer
            asks for height="100%", and a percentage can't resolve against a
            parent whose height comes only from min-height — the chart collapses
            to zero and renders nothing. Every working chart on the Controls tab
            sits in a fixed-height card for the same reason. */}
        <div className="xl:flex-[1.35] h-[460px] bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden flex flex-col">
          <PulseDivergenceScatter laid={laid} />
        </div>

        {/* Capped at every width, not just xl: stacked below the scatter the
            lists used to grow the page by the whole book. */}
        <ScrollArea
          label="Pulse disagreements"
          maxHeight={460}
          className="xl:flex-1 bg-surface border border-line-subtle rounded-lg shadow-sm flex flex-col divide-y divide-line-subtle"
        >
          <DivergenceList
            tone="danger"
            title="AI sees risk the CSM doesn’t"
            caption="The model is reading these colder than the person who owns them. Worth a look before the renewal conversation."
            rows={aiColder}
            emptyMessage="No account currently has an AI Pulse that far below its CSM Pulse."
          />
          <DivergenceList
            tone="ink"
            title="CSM sees risk the AI doesn’t"
            caption="The owner is reading these colder than the model. Usually something the CSM knows that hasn’t reached the data yet."
            rows={csmColder}
            emptyMessage="No account currently has a CSM Pulse that far below its AI Pulse."
          />
        </ScrollArea>
      </div>
    </div>
  );
}

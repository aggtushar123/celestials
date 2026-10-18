import type { CurrencyCode } from '../../../../../features/auth/authSlice';
import type { PipelineStage } from '../../../../../features/forecast/forecastSlice';
import { formatCompactMoney } from '../../../../../features/customers/formatters';
import { ROLE } from '../../../shared/chartPalette';
import { ChartLegend } from '../../../shared/ChartLegend';

export interface PipelineByStageProps {
  stages: PipelineStage[];
  currency: CurrencyCode;
}

/**
 * Open expansion by sales stage, weighted against open.
 *
 * Both numbers on the same bar on purpose: the filled part is what the
 * forecast is carrying, the faint remainder is what is still only a
 * conversation. A screen showing the weighted figure alone hides where the
 * pipeline actually sits, and one showing only the open figure is a wish list.
 */
export function PipelineByStage({ stages, currency }: PipelineByStageProps) {
  const widest = Math.max(1, ...stages.map((stage) => stage.open));
  const totalOpen = stages.reduce((sum, stage) => sum + stage.open, 0);
  const totalWeighted = stages.reduce((sum, stage) => sum + stage.weighted, 0);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div>
          <h3 className="text-[13px] font-bold text-ink">Expansion pipeline</h3>
          <p className="text-[11px] text-ink-faint mt-[1px]">Open expansion by stage, and how much of it the forecast carries</p>
        </div>
        <p className="text-[11px] text-ink-muted shrink-0 tabular-nums">
          {formatCompactMoney(totalWeighted, currency)} of{' '}
          {formatCompactMoney(totalOpen, currency)}
        </p>
      </div>

      <ChartLegend
        className="px-4 pt-2"
        items={[
          { label: 'Weighted', color: ROLE.ink },
          { label: 'Open, not yet weighted', color: ROLE.faint },
        ]}
      />

      {totalOpen === 0 ? (
        <p className="px-4 py-6 text-[12px] text-ink-faint">
          No open opportunities in this selection.
        </p>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-[10px]">
          {stages.map((stage) => (
            <li key={stage.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12px] font-medium text-ink truncate">{stage.name}</span>
                <span className="text-[11px] text-ink-muted tabular-nums shrink-0">
                  {formatCompactMoney(stage.weighted, currency)} of{' '}
                  {formatCompactMoney(stage.open, currency)} · {stage.count}
                </span>
              </div>
              <div className="mt-[3px] h-[10px] rounded-[3px] bg-subtle overflow-hidden">
                <div
                  className="h-full rounded-[3px] flex"
                  style={{ width: `${(stage.open / widest) * 100}%`, backgroundColor: ROLE.faint }}
                >
                  <div
                    className="h-full"
                    style={{
                      backgroundColor: ROLE.ink,
                      width: stage.open > 0 ? `${(stage.weighted / stage.open) * 100}%` : '0%',
                    }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

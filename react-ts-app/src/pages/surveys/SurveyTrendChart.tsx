import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { Survey } from '../../features/customers/customersSlice';
import { Card, CardHeader, EmptyState, TYPE } from '../../components/ui';
import { CATEGORICAL, ROLE, TOOLTIP_STYLE } from '../dashboard/shared/chartPalette';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface TrendPoint {
  key: string;
  month: string;
  nps?: number;
  csat?: number;
  ces?: number;
}

// Same "compute client-side from the already-fetched flat list" approach
// SurveysPage.tsx's own rollup cards already use — no new endpoint.
// Bucketed by month of `responded_at` (when the score was actually
// recorded), not `sent_at` — this is a "how is sentiment trending"
// view, so it should move when responses land, not when surveys go out.
function buildTrend(surveys: Survey[]): TrendPoint[] {
  const buckets = new Map<string, Record<Survey['survey_type'], { sum: number; count: number }>>();

  for (const survey of surveys) {
    if (survey.status !== 'responded' || survey.score === null || !survey.responded_at) continue;
    const [y, m] = survey.responded_at.split('-').map(Number);
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (!buckets.has(key)) {
      buckets.set(key, { nps: { sum: 0, count: 0 }, csat: { sum: 0, count: 0 }, ces: { sum: 0, count: 0 } });
    }
    const bucket = buckets.get(key)![survey.survey_type];
    bucket.sum += survey.score;
    bucket.count += 1;
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, byType]) => {
      const [y, m] = key.split('-').map(Number);
      const point: TrendPoint = { key, month: `${MONTHS[m - 1]} ${y}` };
      (['nps', 'csat', 'ces'] as const).forEach((type) => {
        if (byType[type].count > 0) point[type] = Math.round(byType[type].sum / byType[type].count);
      });
      return point;
    });
}

// Three neutral tones (the third is ink softened, not the faint tone, so it
// keeps 3:1 against the surface), each with its own dash, so the lines (and the legend
// swatches) never rely on colour alone.
const LINES: { type: 'nps' | 'csat' | 'ces'; label: string; color: string; dash: string | undefined }[] = [
  { type: 'nps', label: 'NPS', color: CATEGORICAL[0], dash: undefined },
  { type: 'csat', label: 'CSAT', color: CATEGORICAL[1], dash: '6 3' },
  { type: 'ces', label: 'CES', color: ROLE.inkSoft, dash: '2 3' },
];

const legend = (
  <span className="flex items-center gap-3">
    {LINES.map(({ type, label, color, dash }) => (
      <span key={type} className={`flex items-center gap-1.5 ${TYPE.meta}`}>
        <svg width="12" height="4" viewBox="0 0 12 4" aria-hidden="true">
          <line x1="0" y1="2" x2="12" y2="2" stroke={color} strokeWidth="2" strokeDasharray={dash} />
        </svg>
        {label}
      </span>
    ))}
  </span>
);

export function SurveyTrendChart({ surveys }: { surveys: Survey[] }) {
  const data = useMemo(() => buildTrend(surveys), [surveys]);
  const last = data[data.length - 1];
  const summary = last
    ? `Score trend by month, ${data[0].month} to ${last.month}. Latest, ${last.month}: ${LINES.filter(({ type }) => last[type] !== undefined)
        .map(({ type, label }) => `${label} ${last[type]}`)
        .join(', ')}.`
    : '';

  return (
    <Card pad="none">
      <CardHeader title="Score trend" meta={legend} />
      {data.length === 0 ? (
        <EmptyState size="inline" title="Not enough responses yet." />
      ) : (
        <div className="h-64 px-4 pb-4" role="img" aria-label={summary}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
              <XAxis dataKey="month" axisLine={{ stroke: 'var(--border-default)' }} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} domain={[-100, 100]} ticks={[-100, -50, 0, 50, 100]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              {LINES.map(({ type, label, color, dash }) => (
                <Line
                  key={type}
                  name={label}
                  type="monotone"
                  dataKey={type}
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray={dash}
                  connectNulls
                  dot={{ r: 3, fill: color, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: color, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

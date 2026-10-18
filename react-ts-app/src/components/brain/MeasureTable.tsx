import { changeText, SAY, toneOf, valueText } from '../../features/brain/brainText';
import type { ChangedPayload } from '../../features/brain/brainTypes';
import { ListCard, ListHeaderRow, NUM, TYPE } from '../ui';
import { TONE_CLASS } from './styles';

const COLUMNS = 'sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]';

/** Every metric for the scope (spec §2.3 item 4): rows, not a table
 *  (Decision 11); a header row from sm, and on phones each row stacks with
 *  its own labels. Null reads "Not measured", never zero. */
export function MeasureTable({ changed }: { changed: ChangedPayload }) {
  const { currency } = changed;
  return (
    <section aria-labelledby="measure-heading" className="flex flex-col gap-2">
      <h2 id="measure-heading" className={TYPE.title}>
        {SAY.MEASURE}
      </h2>
      <ListCard
        label={SAY.MEASURE}
        header={<ListHeaderRow columns={COLUMNS} labels={['Metric', 'Then', 'Now', 'Change']} align={['left', 'right', 'right', 'right']} />}
      >
        {changed.metrics.map((m) => (
          <li key={m.key} className={`grid grid-cols-3 gap-x-3 gap-y-1 px-4 py-3 sm:items-baseline ${COLUMNS}`}>
            <span className={`col-span-3 ${TYPE.body} font-semibold sm:col-span-1`}>{m.label}</span>
            <Cell label="Then" value={valueText(m.unit, m.then, currency)} figure={m.then !== null} />
            <Cell label="Now" value={valueText(m.unit, m.now, currency)} figure={m.now !== null} />
            <Cell label="Change" value={changeText(m.unit, m.change, currency)} figure={m.change !== null} tone={TONE_CLASS[toneOf(m.better, m.change)]} />
          </li>
        ))}
      </ListCard>
    </section>
  );
}

function Cell({ label, value, figure, tone = 'text-ink' }: { label: string; value: string; figure: boolean; tone?: string }) {
  return (
    <span className="flex flex-col sm:block sm:text-right">
      <span className={`${TYPE.meta} sm:sr-only`}>{label}</span>
      <span className={figure ? `text-[13px] leading-5 ${NUM} ${tone}` : TYPE.bodyMuted}>{value}</span>
    </span>
  );
}

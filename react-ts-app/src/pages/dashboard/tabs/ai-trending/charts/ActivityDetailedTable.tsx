import { useState } from 'react';
import type { InteractionRow } from '../../../../../features/interactions/interactionsSlice';
import { correctClassification } from '../../../../../features/interactions/interactionsSlice';
import { useAppDispatch, useAppSelector } from '../../../../../hooks';
import { ScrollTable } from '../../../shared/ScrollTable';

const getSentimentColor = (sentiment: string) => {
  switch (sentiment) {
    case 'Positive':
      return 'bg-success text-white';
    case 'Negative':
      return 'bg-danger text-white';
    case 'Neutral':
      // Not a caution — a neutral interaction is neither a win nor a
      // concern, so it stays the same muted tone as an unclassified row.
      return 'bg-subtle text-ink-muted';
    default:
      return 'bg-line text-ink-muted';
  }
};

/** An unclassified row's taxonomy cells. A dash rather than an empty cell, so a
 *  blank reads as "nothing here yet" instead of as a rendering fault. */
const or_dash = (value: string) => value || '—';

/** The most recent interactions, newest first across emails, calls and tickets.
 *
 * Capped server-side at fifty rows — this is a "recent examples" table, not a
 * record browser, and the mock it replaces showed fifteen with no paging. The
 * `title` column is new: the mock showed six columns of categorisation and never
 * said what the interaction actually was, which made every row look the same. */
export function ActivityDetailedTable({ rows }: { rows: InteractionRow[] }) {
  return (
    <div className="w-full h-full p-6 flex flex-col">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-[14px] font-bold text-ink">Detailed Activity Breakdown</h3>
        {rows.length > 0 && (
          <span className="text-[11px] text-ink-faint">{rows.length} most recent</span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-[12.5px] text-ink-faint">No activity matches these filters.</p>
      ) : (
        // The pattern ScrollTable generalised: it scrolls inside the card with
        // the header pinned, and a keyboard can focus it to scroll.
        <ScrollTable caption="Detailed activity breakdown" maxHeight={480} className="flex-1 border border-line rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="py-2.5 px-4 text-[12px] font-bold text-ink-muted border-b border-r border-line whitespace-nowrap">
                  Source Type
                </th>
                <th className="py-2.5 px-4 text-[12px] font-bold text-ink-muted border-b border-r border-line whitespace-nowrap">
                  Account Name
                </th>
                <th className="py-2.5 px-4 text-[12px] font-bold text-ink-muted border-b border-r border-line whitespace-nowrap">
                  Subject
                </th>
                <th className="py-2.5 px-4 text-[12px] font-bold text-ink-muted border-b border-r border-line whitespace-nowrap">
                  Sentiment
                </th>
                <th className="py-2.5 px-4 text-[12px] font-bold text-ink-muted border-b border-r border-line whitespace-nowrap">
                  AI Area
                </th>
                <th className="py-2.5 px-4 text-[12px] font-bold text-ink-muted border-b border-r border-line whitespace-nowrap">
                  AI Category
                </th>
                <th className="py-2.5 px-4 text-[12px] font-bold text-ink-muted border-b border-r border-line whitespace-nowrap">
                  AI Subcategory
                </th>
                <th className="py-2.5 px-4 text-[12px] font-bold text-ink-muted border-b border-line whitespace-nowrap">
                  <span className="sr-only">Correct</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-surface">
              {rows.map((row) => (
                <Row key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </ScrollTable>
      )}
    </div>
  );
}

/**
 * One row, with the control that lets a person correct the model's tags.
 *
 * The correction goes to the backend's feedback log with what the model
 * said and what the person said, and outranks every later reclassify. The
 * options come from the same filter lists the bar uses — the taxonomy has
 * one home, and a subcategory is offered only under its own category.
 */
function Row({ row }: { row: InteractionRow }) {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((s) => s.interactions.stats?.filters);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.keys);
  const [error, setError] = useState<string | null>(null);
  const subcategories = (filters?.subcategories ?? []).filter((o) => o.category === draft.category);

  async function save() {
    setError(null);
    const fields: Partial<InteractionRow['keys']> = {};
    (['area', 'category', 'subcategory', 'sentiment'] as const).forEach((k) => {
      if (draft[k] !== row.keys[k]) fields[k] = draft[k];
    });
    if (Object.keys(fields).length === 0) {
      setEditing(false);
      return;
    }
    const result = await dispatch(correctClassification({ id: row.id, fields }));
    if (correctClassification.rejected.match(result)) {
      setError(result.payload ?? 'Could not save that correction.');
      return;
    }
    setEditing(false);
  }

  const select = (
    label: string,
    key: keyof InteractionRow['keys'],
    options: { value: string; name: string }[]
  ) => (
    <select
      aria-label={`${label} for ${row.title}`}
      value={draft[key]}
      onChange={(e) =>
        setDraft((d) => ({
          ...d,
          [key]: e.target.value,
          // A new category empties the subcategory: it must sit under it.
          ...(key === 'category' ? { subcategory: '' } : {}),
        }))
      }
      className="px-1.5 py-1 bg-surface border border-line rounded text-[12px] text-ink focus:outline-none focus:border-accent max-w-[150px]"
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.name}
        </option>
      ))}
    </select>
  );

  if (editing) {
    return (
      <tr className="bg-subtle/60 border-b border-line-subtle">
        <td className="py-2 px-4 text-[13px] text-ink-muted border-r border-line-subtle">{row.source}</td>
        <td className="py-2 px-4 text-[13px] text-ink font-medium border-r border-line-subtle truncate max-w-[200px]">
          {row.account}
        </td>
        <td className="py-2 px-4 text-[13px] text-ink border-r border-line-subtle truncate max-w-[260px]" title={row.title}>
          {row.title}
        </td>
        <td className="py-2 px-3 border-r border-line-subtle">{select('Sentiment', 'sentiment', filters?.sentiments ?? [])}</td>
        <td className="py-2 px-3 border-r border-line-subtle">{select('AI area', 'area', filters?.areas ?? [])}</td>
        <td className="py-2 px-3 border-r border-line-subtle">{select('AI category', 'category', filters?.categories ?? [])}</td>
        <td className="py-2 px-3 border-r border-line-subtle">{select('AI subcategory', 'subcategory', subcategories)}</td>
        <td className="py-2 px-3 whitespace-nowrap">
          <button type="button" onClick={save} className="text-[12px] font-bold text-accent hover:underline mr-2">
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft(row.keys);
              setError(null);
            }}
            className="text-[12px] font-semibold text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
          {error && (
            <div className="text-[11px] text-danger mt-1" role="alert">
              {error}
            </div>
          )}
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-subtle/80 transition-colors border-b border-line-subtle last:border-0">
                  <td className="py-2 px-4 text-[13px] text-ink-muted border-r border-line-subtle">
                    {row.source}
                  </td>
                  <td
                    className="py-2 px-4 text-[13px] text-ink font-medium border-r border-line-subtle truncate max-w-[200px]"
                    title={row.account}
                  >
                    {row.account}
                  </td>
                  <td
                    className="py-2 px-4 text-[13px] text-ink-muted border-r border-line-subtle truncate max-w-[260px]"
                    title={row.title}
                  >
                    {row.title}
                  </td>
                  <td className="py-1.5 px-4 border-r border-line-subtle">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${getSentimentColor(row.sentiment)}`}
                    >
                      {row.sentiment}
                    </span>
                  </td>
                  <td className="py-2 px-4 text-[13px] text-ink-muted border-r border-line-subtle">
                    {or_dash(row.area)}
                  </td>
                  <td className="py-2 px-4 text-[13px] text-ink-muted border-r border-line-subtle">
                    {or_dash(row.category)}
                  </td>
                  <td className="py-2 px-4 text-[13px] text-ink-muted border-r border-line-subtle">
                    {or_dash(row.subcategory)}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    {row.corrected && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-success mr-2" title="Corrected by a person; a reclassify leaves this row alone">
                        corrected
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(row.keys);
                        setEditing(true);
                      }}
                      aria-label={`Correct ${row.title}`}
                      className="text-[12px] font-semibold text-ink-faint hover:text-accent"
                    >
                      Correct
                    </button>
                  </td>
    </tr>
  );
}

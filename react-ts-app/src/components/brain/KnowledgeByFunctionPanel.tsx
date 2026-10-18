import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/apiClient';
import { useCapability } from '../../hooks';
import { Card, CardBody, CardHeader, ErrorState as UiErrorState, LoadingState, NO_VALUE, TABLE, TD, TD_NUM, TH, TYPE } from '../ui';

interface FunctionRow {
  function: string;
  label: string;
  members: number;
  contributors: number;
  contributions: number;
  questions_asked: number;
  questions_answered: number;
  questions_waiting: number;
  avg_days_to_answer: number | null;
}

interface Payload {
  days: number;
  since: string;
  functions: FunctionRow[];
}

/**
 * Is the company writing things down? The brain only knows what people
 * tell it, so this is the honest measure: per function, who contributed,
 * how much, what they were asked, what they answered, what still waits on
 * them, and how long they take. Functions with nobody in them are left
 * out: an empty row for "Other" says nothing.
 */
export function KnowledgeByFunctionPanel() {
  const canSeeAll = useCapability('view_all_accounts');
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canSeeAll) return;
    apiFetch<Payload>('/knowledge/activity/?days=30')
      .then(setData)
      .catch(() => setError('Could not load knowledge activity.'));
  }, [canSeeAll]);

  // Organisation-wide: hidden rather than shown empty for a role that cannot load it.
  if (!canSeeAll) return null;

  const rows = (data?.functions ?? []).filter((r) => r.members > 0 || r.contributions > 0 || r.questions_asked > 0);

  return (
    <Card pad="none" aria-label="Knowledge by function">
      <CardHeader title="Knowledge by function" meta={data ? `Last ${data.days} days` : undefined} />
      <CardBody>
        <p className={`max-w-[68ch] ${TYPE.bodyMuted}`}>What each part of the company wrote down about customers, what it was asked, and how fast it answered.</p>
      </CardBody>
      {error ? (
        <UiErrorState message={error} />
      ) : !data ? (
        <LoadingState label="Loading knowledge activity" variant="block" />
      ) : (
        <div className="overflow-x-auto border-t border-line-subtle">
          <table className={`${TABLE} min-w-[40rem]`}>
            <thead>
              <tr>
                <th className={TH}>Function</th>
                {['People', 'Contributed', 'Notes', 'Asked', 'Answered', 'Waiting', 'Days to answer'].map((label) => (
                  <th key={label} className={`${TH} text-right`}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {rows.map((r) => {
                const silent = r.members > 0 && r.contributions === 0;
                return (
                  <tr key={r.function} aria-label={r.label}>
                    <td className={`${TD} font-semibold`}>{r.label}</td>
                    <td className={TD_NUM}>{r.members}</td>
                    <td className={TD_NUM}>
                      {r.contributors}
                      {silent ? <span className="text-ink-muted"> · nothing yet</span> : null}
                    </td>
                    <td className={TD_NUM}>{r.contributions}</td>
                    <td className={TD_NUM}>{r.questions_asked}</td>
                    <td className={TD_NUM}>{r.questions_answered}</td>
                    <td className={TD_NUM}>{r.questions_waiting}</td>
                    <td className={TD_NUM}>{r.avg_days_to_answer === null ? NO_VALUE : r.avg_days_to_answer}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector, useCapability } from '../../hooks';
import { fetchFeedback } from '../../features/feedback/feedbackSlice';
import type { FeedbackEntry, FeedbackKind } from '../../features/feedback/feedbackSlice';
import { formatDate } from '../../features/customers/formatters';
import { Badge, EmptyState, ErrorState, FORM_ALERT, LoadingState, MetaParts, NO_VALUE, NUM, SettingsFrame, SettingsNote, SettingsSection, TYPE, Tabs, tabId, tabPanelId } from '../../components/ui';
import { settingsTitle } from '../settings/workspaceSettingsNav';

type KindTab = FeedbackKind | 'all';
const KINDS: { key: KindTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'classification', label: 'Classifications' },
  { key: 'proposal', label: 'Proposals' },
  { key: 'health_override', label: 'Health overrides' },
];
const ID = 'feedback';

/** A before→after line for one field, or nothing if it didn't change. */
function Change({ label, before, after }: { label: string; before: unknown; after: unknown }) {
  if (before === after) return null;
  const show = (v: unknown) => (v === null || v === undefined || v === '' ? NO_VALUE : String(v));
  const figure = (v: unknown) => (typeof v === 'number' ? NUM : '');
  return (
    <li className={TYPE.body}>
      <span className="text-ink-muted">{label}: </span>
      <span className={`text-ink-muted line-through ${figure(before)}`.trim()}>{show(before)}</span>
      <span className="text-ink-muted"> → </span>
      <span className={`font-semibold ${figure(after)}`.trim()}>{show(after)}</span>
    </li>
  );
}

function EntryBody({ entry }: { entry: FeedbackEntry }) {
  if (entry.kind === 'classification') {
    return (
      <ul className="flex flex-col gap-0.5">
        {(['area', 'category', 'subcategory', 'sentiment'] as const).map((k) => (
          <Change key={k} label={k} before={entry.before[k]} after={entry.after[k]} />
        ))}
      </ul>
    );
  }
  if (entry.kind === 'proposal') {
    const decision = String(entry.after.decision ?? '');
    return (
      <p className={TYPE.bodyMuted}>
        The agent proposed a <span className="font-semibold text-ink">{String(entry.before.kind)}</span>;{' '}
        <span className={`font-semibold ${decision === 'approved' ? 'text-success-ink' : 'text-danger-ink'}`}>{decision}</span>.
      </p>
    );
  }
  return (
    <ul>
      <Change label="health score" before={entry.before.health_score} after={entry.after.health_score_override ?? 'rubric'} />
    </ul>
  );
}

/**
 * The feedback log: real, this time.
 *
 * The mock page of this name listed invented "feedback entries". This one
 * lists every correction a person made to something the system said: a
 * classification fixed by hand, a proposal approved or rejected, a health
 * score overridden. What the system said and what the person said sit in
 * the same row, which is what makes it worth keeping: it is the set of
 * cases the next prompt, taxonomy or rubric change should be read against.
 */
export function FeedbackLogPage() {
  const dispatch = useAppDispatch();
  const canSeeAll = useCapability('view_all_accounts');
  const { data, isLoading, error } = useAppSelector((s) => s.feedback);
  const [tab, setTab] = useState<KindTab>('all');
  const kind: FeedbackKind | '' = tab === 'all' ? '' : tab;

  useEffect(() => {
    if (canSeeAll) dispatch(fetchFeedback(kind));
  }, [dispatch, canSeeAll, kind]);

  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;
  // Another kind is loading over a list already on screen: keep it, marked busy.
  const reloading = Boolean(data) && isLoading;

  return (
    <SettingsFrame
      title={settingsTitle('/settings/ai/feedback')}
      intro="Every time a person corrected the system: what it said, and what they said."
      note={canSeeAll ? undefined : <SettingsNote icon="lock">The feedback log spans every book, which needs the view-all-accounts capability.</SettingsNote>}
    >
      {canSeeAll ? (
        <>
          <div className="h-11 border-b border-line-subtle">
            <Tabs
              label="Kinds"
              idBase={ID}
              items={KINDS.map((k) => ({ key: k.key, label: k.label, count: k.key === 'all' ? total : (data?.counts[k.key] ?? 0) }))}
              value={tab}
              onChange={setTab}
            />
          </div>
          <div role="tabpanel" id={tabPanelId(ID, tab)} aria-labelledby={tabId(ID, tab)} className="flex flex-col gap-6">
            {/* With a list on screen, a failed reload is said above it; with none, inside the card. */}
            {error && data ? (
              <p role="alert" className={FORM_ALERT}>
                {error}
              </p>
            ) : null}
            <div aria-busy={reloading || undefined}>
              <SettingsSection
                title="Corrections"
                list="Corrections"
                action={reloading ? <span className={TYPE.meta}>Updating…</span> : undefined}
                state={
                  error && !data ? (
                    <ErrorState message={error} onRetry={() => void dispatch(fetchFeedback(kind))} />
                  ) : !data && isLoading ? (
                    <LoadingState label="Loading corrections" />
                  ) : data && data.feedback.length === 0 && !isLoading ? (
                    <EmptyState title="Nothing corrected yet." detail="Corrections arrive from the AI Trending table, Waiting on you and health-score overrides." />
                  ) : undefined
                }
              >
                {data?.feedback.map((entry) => (
                  <li key={entry.id} className="flex flex-col gap-1.5 px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <Badge>{entry.kind_display}</Badge>
                        <p title={entry.subject_label} className={`${TYPE.body} truncate font-semibold`}>
                          {entry.subject_label}
                        </p>
                      </div>
                      <p className={TYPE.meta}>
                        <MetaParts parts={[entry.made_by ?? 'someone', formatDate(entry.created_at.slice(0, 10))]} />
                      </p>
                    </div>
                    <EntryBody entry={entry} />
                    {entry.note ? <p className={`${TYPE.bodyMuted} italic`}>“{entry.note}”</p> : null}
                  </li>
                ))}
              </SettingsSection>
            </div>
          </div>
        </>
      ) : null}
    </SettingsFrame>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, Clock } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { fetchSurveys, fetchCustomers, updateSurvey, deleteSurvey } from '../../features/customers/customersSlice';
import type { Survey } from '../../features/customers/customersSlice';
import { SurveyFormModal } from '../../components/pipelines/SurveyFormModal';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import {
  Badge,
  CardHeader,
  EmptyState,
  FOCUS,
  ICON_BUTTON,
  INLINE_TARGET,
  ListCard,
  ListHeaderRow,
  ListRow,
  LoadingState,
  NO_VALUE,
  NUM,
  PRIMARY,
  QUIET,
  Select,
  Tile,
  tileRow,
  Toolbar,
  TYPE,
} from '../../components/ui';
import { SurveyTrendChart } from './SurveyTrendChart';
import { LOGGED_GRID } from './loggedGrid';
import { companyLabel } from '../../features/customers/formatters';
import { formatDate } from '../../features/customers/formatters';

/** Surveys listed 50 at a time; Show more adds the next 50. */
const PAGE = 50;

/** The organisation page's Story filtered to Feedback, where a click on the
 *  row used to go. A survey with no organisation has no target. */
const rowHref = (survey: Survey) => {
  const id = survey.companies[0]?.id;
  return id === undefined ? undefined : `/organizations/${id}?group=feedback`;
};

const TYPE_CARDS: { type: Survey['survey_type']; label: string }[] = [
  { type: 'nps', label: 'NPS' },
  { type: 'csat', label: 'CSAT' },
  { type: 'ces', label: 'CES' },
];

// Structurally lighter than Health/Lifecycle — no currency dimension,
// so no COUNT/MRR-style toggle needed. Rollup cards are computed
// client-side from the same unpaginated `surveys` list held for this
// page — no separate stats endpoint (see SurveyListView's own docstring
// on the backend; unlike this page's rollups, the Pipelines portfolio's
// tiles are computed server-side, from `summary`).
/** The Logged scores tab of /surveys (surveys spec §2.1; UI foundations
 *  spec §11: restyled, not retired). It only renders inside /surveys, whose
 *  bar titles it; the organisation picker keeps `?tab=logged`. */
export function SurveysPage() {
  const dispatch = useAppDispatch();
  const { surveys: held, surveysLoading, surveysError, surveysFor, customers } = useAppSelector((state) => state.customers);
  const [selectedType, setSelectedType] = useState<Survey['survey_type'] | null>(null);
  const [isLogging, setIsLogging] = useState(false);
  const [editingSurvey, setEditingSurvey] = useState<Survey | null>(null);
  const [deletingSurvey, setDeletingSurvey] = useState<Survey | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focusAt = useRef<number | null>(null);
  const [paging, setPaging] = useState({ key: '', shown: PAGE });

  // ?customer=<id> narrows the page to one organization (spec 2026-09-27
  // §5); the organization page's "Manage surveys" links here with it.
  const [search, setSearch] = useSearchParams();
  const customerParam = search.get('customer') ?? '';
  const customerId = /^[1-9]\d*$/.test(customerParam) ? Number(customerParam) : null;

  useEffect(() => {
    dispatch(fetchSurveys(customerId ?? undefined));
  }, [dispatch, customerId]);
  useEffect(() => {
    // The company pickers (Log Survey, and the organization filter).
    dispatch(fetchCustomers());
  }, [dispatch]);

  // Until the chosen filter's read lands, the store still holds the previous
  // filter's surveys: the rollups, chart and table wait rather than show them.
  const current = surveysFor === customerId;
  const surveys = useMemo(() => (current ? held : []), [current, held]);

  const companies = useMemo(() => customers.map((c) => ({ id: c.id, name: c.name })), [customers]);
  // The picker lists the first page of organizations; one not on it is
  // named from its surveys, or by its id.
  const filteredName =
    customerId === null
      ? null
      : (companies.find((c) => c.id === customerId)?.name ??
        surveys.flatMap((s) => s.companies).find((c) => c.id === customerId)?.name ??
        `Organization ${customerId}`);

  const rollup = useMemo(() => {
    const buckets: Record<Survey['survey_type'], { sent: number; responded: number; scoreSum: number }> = {
      nps: { sent: 0, responded: 0, scoreSum: 0 },
      csat: { sent: 0, responded: 0, scoreSum: 0 },
      ces: { sent: 0, responded: 0, scoreSum: 0 },
    };
    for (const survey of surveys) {
      const bucket = buckets[survey.survey_type];
      bucket.sent += 1;
      if (survey.status === 'responded' && survey.score !== null) {
        bucket.responded += 1;
        bucket.scoreSum += survey.score;
      }
    }
    return buckets;
  }, [surveys]);

  const rows = useMemo(
    () => (selectedType ? surveys.filter((s) => s.survey_type === selectedType) : surveys),
    [surveys, selectedType]
  );

  // One-way, no confirm — same "Log Response" convention: an immediate
  // status move, no undo built for either.
  function handleMarkExpired(survey: Survey) {
    dispatch(updateSurvey({ id: survey.id, status: 'expired' }));
  }

  // A new filter starts again at the first fifty.
  const filterKey = `${customerId}|${selectedType}`;
  const shown = paging.key === filterKey ? paging.shown : PAGE;
  useEffect(() => {
    const at = focusAt.current;
    if (at === null) return;
    focusAt.current = null;
    listRef.current?.querySelectorAll('[data-survey]')[at]?.querySelector<HTMLElement>('a, button')?.focus();
  }, [shown]);
  const label = (type: Survey['survey_type']) => TYPE_CARDS.find((card) => card.type === type)!.label;
  return (
    <div className="flex flex-col gap-4">
      <p className={TYPE.bodyMuted}>
        {filteredName ? `Every NPS, CSAT and CES survey logged for ${filteredName} and its accounts.` : 'Every NPS, CSAT and CES survey logged across every organisation and account.'}
      </p>
      <Toolbar
        filters={
          <Select
            label="Organization"
            labelPosition="inline"
            value={customerId === null ? '' : String(customerId)}
            onChange={(next) => setSearch(next ? { tab: 'logged', customer: next } : { tab: 'logged' })}
            options={[
              { value: '', label: 'All organizations' },
              ...(customerId !== null && !companies.some((c) => c.id === customerId) ? [{ value: String(customerId), label: filteredName ?? '' }] : []),
              ...companies.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
          />
        }
        count={current ? (rows.length > shown ? `Showing ${shown} of ${rows.length} surveys` : `${rows.length} ${rows.length === 1 ? 'survey' : 'surveys'}`) : ''}
        actions={{
          primary: (
            <button type="button" onClick={() => setIsLogging(true)} className={PRIMARY}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Log survey
            </button>
          ),
        }}
      />
      {surveysError ? (
        <p role="alert" className="text-[13px] leading-5 text-danger-ink">
          {surveysError}
        </p>
      ) : null}
      <div ref={listRef} className="@container flex flex-col gap-4">
        {!current && !surveysError ? (
          <LoadingState label="Loading the survey rollups" variant="tiles" count={3} />
        ) : current ? (
          <div className={tileRow(3, 'container')}>
            {TYPE_CARDS.map(({ type, label: name }) => {
              const bucket = rollup[type];
              const rate = bucket.sent > 0 ? Math.round((bucket.responded / bucket.sent) * 100) : null;
              const average = bucket.responded > 0 ? Math.round(bucket.scoreSum / bucket.responded) : null;
              const active = selectedType === type;
              return (
                <Tile
                  key={type}
                  label={name}
                  value={bucket.sent}
                  meta={
                    rate === null ? (
                      'No responses yet'
                    ) : (
                      <>
                        <span className={NUM}>{rate}%</span> responded
                        {average !== null ? (
                          <>
                            {' · avg '}
                            <span className={NUM}>{average}</span>
                          </>
                        ) : null}
                      </>
                    )
                  }
                  pressed={active}
                  onPress={() => setSelectedType(active ? null : type)}
                  buttonLabel={`${name}: ${bucket.sent} sent`}
                />
              );
            })}
          </div>
        ) : null}
        {current ? <SurveyTrendChart surveys={surveys} /> : null}
        <ListCard
          label="Logged surveys"
          header={
            <>
              <CardHeader
                title={selectedType ? `${label(selectedType)} surveys` : 'All surveys'}
                meta={<span className={NUM}>{rows.length}</span>}
                action={
                  selectedType ? (
                    <button type="button" onClick={() => setSelectedType(null)} className={QUIET}>
                      Clear filter
                    </button>
                  ) : undefined
                }
              />
              {surveysLoading || rows.length === 0 ? null : (
                <ListHeaderRow columns={LOGGED_GRID.columns} labels={LOGGED_GRID.labels} align={LOGGED_GRID.aligns} show={LOGGED_GRID.headerShow} />
              )}
            </>
          }
          state={
            surveysLoading ? (
              <LoadingState label="Loading surveys" />
            ) : rows.length === 0 ? (
              <EmptyState title={filteredName ? `No surveys logged for ${filteredName} yet.` : 'No surveys logged yet.'} />
            ) : undefined
          }
          footer={
            rows.length > shown ? (
              <button type="button" onClick={() => {
                  // The button unmounts on the last page: focus moves to the first new row.
                  focusAt.current = shown;
                  setPaging({ key: filterKey, shown: shown + PAGE });
                }} className={QUIET}>
                Show more surveys
              </button>
            ) : undefined
          }
        >
          {rows.slice(0, shown).map((survey) => {
            const name = `${companyLabel(survey.companies)}${survey.account_name ? ` · ${survey.account_name}` : ''}`;
            return (
              <ListRow
                key={survey.id}
                dataAttrs={{ 'data-survey': survey.id }}
                title={name}
                href={rowHref(survey)}
                columns={LOGGED_GRID.columns}
                gridAt={LOGGED_GRID.gridAt}
                meta={
                  <span className={LOGGED_GRID.narrowOnly}>
                    {survey.survey_type_display} · {formatDate(survey.sent_at)} · {survey.status_display}
                    {survey.score !== null ? (
                      <>
                        {' · '}
                        <span className={NUM}>{survey.score}</span>
                      </>
                    ) : null}
                  </span>
                }
                cells={[
                  <span key="type" className={`block ${TYPE.bodyMuted}`}>
                    {survey.survey_type_display}
                  </span>,
                  <span key="sent" className={`block ${TYPE.bodyMuted} ${NUM}`}>
                    {formatDate(survey.sent_at)}
                  </span>,
                  <span key="status" className="block">
                    <Badge>{survey.status_display}</Badge>
                  </span>,
                  <span key="score" className={`block text-right ${TYPE.body} ${NUM}`}>
                    {survey.score ?? NO_VALUE}
                  </span>,
                ]}
                actions={
                  survey.send_id ? (
                    // A sent survey's score updates itself; the backend
                    // refuses edits and deletes (backend Decision 28).
                    <Link to={`/surveys/${survey.send_id}`} className={`${INLINE_TARGET} ${TYPE.meta} hover:underline ${FOCUS}`}>
                      From a sent survey
                    </Link>
                  ) : (
                    <>
                      {survey.status === 'sent' ? (
                        <button type="button" onClick={() => handleMarkExpired(survey)} aria-label={`Mark expired: ${name}`} className={ICON_BUTTON}>
                          <Clock className="h-4 w-4" aria-hidden="true" />
                        </button>
                      ) : null}
                      <button type="button" onClick={() => setEditingSurvey(survey)} aria-label={`Edit: ${name}`} className={ICON_BUTTON}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => setDeletingSurvey(survey)} aria-label={`Delete: ${name}`} className={ICON_BUTTON}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </>
                  )
                }
              />
            );
          })}
        </ListCard>
      </div>

      {isLogging && <SurveyFormModal companies={companies} onClose={() => setIsLogging(false)} />}

      {editingSurvey && (
        <SurveyFormModal
          survey={editingSurvey}
          onClose={() => setEditingSurvey(null)}
          onDeleteRequest={() => {
            setDeletingSurvey(editingSurvey);
            setEditingSurvey(null);
          }}
        />
      )}

      {deletingSurvey && (
        <ConfirmDialog
          title={`Delete this ${label(deletingSurvey.survey_type)} survey?`}
          message="This can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await dispatch(deleteSurvey(deletingSurvey.id)).unwrap();
          }}
          onClose={() => setDeletingSurvey(null)}
        />
      )}
    </div>
  );
}

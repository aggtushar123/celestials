import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Network } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { BrainControls } from '../../components/brain/BrainControls';
import { BrainFrame } from '../../components/brain/BrainFrame';
import { AnomalyList, AskList, SeeAll } from '../../components/brain/CustomerLists';
import { CustomersSkeleton } from '../../components/brain/CustomersSkeleton';
import { CustomerTiles } from '../../components/brain/CustomerTiles';
import { LostAccessNotice } from '../../components/brain/LostAccessNotice';
import { ScoresPanel } from '../../components/brain/ScoresPanel';
import { SentimentPanel } from '../../components/brain/SentimentPanel';
import { useBrainScope } from '../../components/brain/useBrainScope';
import { useScopedRead } from '../../components/brain/useScopedRead';
import { Card, ErrorState as UiErrorState, FOCUS, LoadingState, QUIET, TYPE } from '../../components/ui';
import { fetchCustomers } from '../../features/brain/brainApi';
import { graphHref } from '../../features/brain/brainText';
import { CS, customerSectionOf, type CustomerSectionKey } from '../../features/brain/customersText';
import { useReportBrainScope } from './ask/brainScopeReport';

const headingId = (key: CustomerSectionKey) => `customers-${key}`;
/** Two sections side by side from lg, stacked below (brain UI spec §2). */
const PAIR = 'grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]';

function Section({ id, title, action, children }: { id: CustomerSectionKey; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={headingId(id)} data-section={id} className="flex min-w-0 flex-col gap-3">
      {/* Fix wave item 3: a steady min height so Asks (with See all) and
          Anomalies start their cards at the same height side by side. */}
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        <h2 id={headingId(id)} tabIndex={-1} className={`${TYPE.title} ${FOCUS}`}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** /brain/customers: What customers are saying (spec
 *  2026-10-05-brain-customers-design §2.1), for every member, scoped Me · My
 *  team · Company, in the Brain frame (brain UI spec 2026-10-06): the graph
 *  link, the tiles, then Asks beside Anomalies and Scores beside Sentiment
 *  from lg. Reads only. */
export function CustomersPage() {
  const brain = useBrainScope();
  useReportBrainScope(brain.scope, brain.error !== null);
  const scope = brain.scope;
  const read = useScopedRead(scope, fetchCustomers, brain.refused, CS.LOAD);
  const data = read.data;
  const [params] = useSearchParams();
  const section = customerSectionOf(params.get('section'));
  const landed = useRef<CustomerSectionKey | null>(null);
  const [today] = useState(() => new Date());

  // Plan Decision 3: a section named in the URL takes focus once the data is here.
  useEffect(() => {
    if (!data || !section || landed.current === section) return;
    landed.current = section;
    const heading = document.getElementById(headingId(section));
    heading?.focus();
    heading?.scrollIntoView?.({ block: 'start' });
  }, [data, section]);

  let body: ReactNode;
  if (brain.error) body = (
      <Card pad="none">
        <UiErrorState message={brain.error} onRetry={brain.retry} />
      </Card>
    );
  else if (read.error) body = (
      <Card pad="none">
        <UiErrorState message={read.error} onRetry={read.retry} />
      </Card>
    );
  else if (!scope || !data) body = <CustomersSkeleton />;
  else
    body = (
      <>
        <div className={PAIR}>
          <Section id="asks" title={CS.ASKS} action={<SeeAll page="requests" scope={scope} shown={data.asks.top.length} total={data.asks.total} />}>
            <AskList asks={data.asks.top} scope={scope} currency={data.currency} />
          </Section>
          <Section
            id="anomalies"
            title={CS.ANOMALIES}
            action={<SeeAll page="anomalies" scope={scope} shown={data.anomalies.top.length} total={data.anomalies.total} />}
          >
            <AnomalyList anomalies={data.anomalies.top} currency={data.currency} />
          </Section>
        </div>
        <div className={PAIR}>
          <Section id="scores" title={CS.SCORES}>
            <ScoresPanel scores={data.scores} />
          </Section>
          <Section id="sentiment" title={CS.SENTIMENT}>
            <SentimentPanel sentiment={data.sentiment} today={today} />
          </Section>
        </div>
      </>
    );

  // The tiles (brain UI spec §2) replace the section links: each sets
  // `?section=` and the effect above moves focus there.
  let tiles: ReactNode = null;
  if (!brain.error && !read.error) {
    tiles =
      scope && data ? (
        <CustomerTiles data={data} current={section} onSame={(key) => document.getElementById(headingId(key))?.focus()} />
      ) : (
        <div aria-hidden="true">
          <LoadingState label="Loading the counts" variant="tiles" count={5} />
        </div>
      );
  }

  return (
    <BrainFrame>
      <BrainControls brain={brain} />
      {brain.notice ? <LostAccessNotice message={brain.notice} /> : null}
      {tiles}
      {scope ? (
        <div className="flex justify-end">
          <Link to={graphHref(scope)} className={`${QUIET} gap-1.5`}>
            <Network className="h-4 w-4" aria-hidden="true" />
            {CS.GRAPH}
          </Link>
        </div>
      ) : null}
      {body}
    </BrainFrame>
  );
}

import { Link, Outlet, useParams } from 'react-router-dom';
import { fetchSend } from '../../features/surveys/surveyApi';
import { countsLines } from '../../features/surveys/surveyText';
import type { SurveySend } from '../../features/surveys/surveyTypes';
import { AnswersSection } from '../../components/surveys/AnswersSection';
import { Lines } from '../../components/surveys/Lines';
import { NotAnswered } from '../../components/surveys/NotAnswered';
import { SendHeader } from '../../components/surveys/SendHeader';
import { SendFailed, SendLoading, SendMissing } from '../../components/surveys/SendStates';
import { SendTiles } from '../../components/surveys/SendTiles';
import { useSend } from '../../components/surveys/useSend';
import { useSendingPoll } from '../../hooks/useSendingPoll';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { Card, EmptyState, PageHeader, PRIMARY, TYPE } from '../../components/ui';

const BACK = { to: '/surveys', label: 'Surveys' } as const;

/** What the send page hands its `edit` child route: the send it has read,
 *  and how to swap in the saved copy. */
export interface SendOutlet {
  send: SurveySend;
  onReplace: (send: SurveySend) => void;
}

/** /surveys/:id (spec §2.3). */
export function SendPage() {
  const { id } = useParams();
  if (!id || !/^\d+$/.test(id)) {
    return (
      <OrganizationsFrame>
        <PageHeader back={BACK} title="Survey" />
        <SendMissing />
      </OrganizationsFrame>
    );
  }
  return <LoadedSend key={id} id={Number(id)} />;
}

function LoadedSend({ id }: { id: number }) {
  const [load, replace, retry] = useSend(id);
  if (load.status === 'ready') return <SendView send={load.send} onReplace={replace} />;
  return (
    <OrganizationsFrame>
      <PageHeader back={BACK} title="Survey" />
      {load.status === 'loading' ? <SendLoading /> : null}
      {load.status === 'missing' ? <SendMissing /> : null}
      {load.status === 'failed' ? <SendFailed message={load.message} onRetry={retry} /> : null}
    </OrganizationsFrame>
  );
}

function SendView({ send, onReplace }: { send: SurveySend; onReplace: (send: SurveySend) => void }) {
  // Send-now claims at once and answers `sending`; a minute runner
  // delivers in the background, so this reads the send again until it
  // leaves that status.
  useSendingPoll(send.id, send, () => fetchSend(send.id), onReplace);
  return (
    <OrganizationsFrame>
      <PageHeader back={BACK} />
      <div className="flex flex-col gap-4 pb-6">
        <SendHeader send={send} />
        {send.status === 'draft' ? (
          <Card pad="none">
            <EmptyState
              title="Not sent yet"
              detail={send.is_owner ? 'Edit it to choose who it reaches, check the preview, then send.' : 'Its owner has not sent it yet.'}
              action={
                send.is_owner ? (
                  <Link to={`/surveys/${send.id}/edit`} className={PRIMARY}>
                    Edit and send
                  </Link>
                ) : null
              }
            />
          </Card>
        ) : (
          <>
            <div className="@container">
              <SendTiles send={send} />
            </div>
            {/* `counts` is written at claim time (sent/failed both 0) and
             * only frozen to its real values once the send finishes; the
             * tiles above already show the live counts so far, so showing
             * this line too while still `sending` would read as a second,
             * contradictory count ("0 sent" beside a Sent tile reading 1). */}
            {send.counts && send.status !== 'sending' ? (
              <p data-part="counts" className={TYPE.bodyMuted}>
                At the send: <Lines lines={countsLines(send.counts)} />
              </p>
            ) : null}
            <AnswersSection send={send} />
            <NotAnswered send={send} />
          </>
        )}
      </div>
      {/* /surveys/:id/edit: the modal over this page. */}
      <Outlet context={{ send, onReplace } satisfies SendOutlet} />
    </OrganizationsFrame>
  );
}

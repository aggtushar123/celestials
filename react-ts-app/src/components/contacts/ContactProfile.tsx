import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Ellipsis, Mail, MailX, Pencil, Phone, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { whyQuestion } from '../../features/contacts/askContext';
import { placeOf, readableEvidenceOf, sentimentWhy } from '../../features/contacts/contactsFormat';
import { deleteContact, fetchContactById, fetchContactHistory, updateContact } from '../../features/customers/customersSlice';
import { formatRelativeTime, initials } from '../../features/customers/formatters';
import { mailtoHref, telHref } from '../../lib/contactLinks';
import { dayLabel } from '../../features/surveys/surveyText';
import { AskDraftContext } from '../../pages/dashboard/ask/context';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { ITEM_LINK } from '../organizations/detail/listStyles';
import {
  BUTTON,
  Card,
  CardBody,
  CardSection,
  ErrorState as UiErrorState,
  ICON_BUTTON,
  Initials,
  LoadingState,
  Menu,
  NUM,
  QUIET,
  SentimentBadge,
  TYPE,
} from '../ui';
import { ContactFormModal } from './ContactFormModal';
import { HistoryCallItem, HistoryEmailItem, HistoryTicketItem } from './HistoryItems';
import { ContactMeetingSheet } from '../calendar/ContactMeetingSheet';

function Section({ title, count, shown, empty, children }: { title: string; count: number; shown: number; empty: string; children: ReactNode }) {
  const id = useId();
  return (
    <CardSection>
      <section aria-labelledby={id} className="flex flex-col gap-1">
        <h3 id={id} className={`flex items-baseline gap-2 ${TYPE.label}`}>
          {title}
          <span className={`${TYPE.meta} ${NUM}`}>{count}</span>
        </h3>
        {shown === 0 ? (
          <p className={`py-2 ${TYPE.bodyMuted}`}>{empty}</p>
        ) : (
          <>
            <ul className="divide-y divide-line-subtle">{children}</ul>
            {count > shown ? (
              <p className={TYPE.meta}>
                The newest <span className={NUM}>{shown}</span> of <span className={NUM}>{count}</span>.
              </p>
            ) : null}
          </>
        )}
      </section>
    </CardSection>
  );
}

/** The selected person (spec 2026-09-28 §3): who they are and how to reach
 *  them, where they sit (each linking to the organisation page, the account
 *  with its chip chosen), their sentiment and why, then their calls newest
 *  first, emails and tickets. Edit and Delete are the existing flows. */
export function ContactProfile({ id, onDeleted, onSaved = () => {} }: { id: number; onDeleted: () => void; onSaved?: () => void }) {
  const dispatch = useAppDispatch();
  const draft = useContext(AskDraftContext);
  const { selectedContact, selectedContactHistory } = useAppSelector((state) => state.customers);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [resubscribing, setResubscribing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  // Tied to `id` by the closure below, not read off the shared slice: two
  // requests for different people race through the same
  // selectedContactError/selectedContactHistoryError fields, so a
  // component still showing person A could otherwise paint B's error for a
  // tick, or A's late failure after B is already on screen (fix round 1,
  // 2026-09-28). `cancelled` drops a reply that arrives after `id` (or
  // `attempt`) has moved on, exactly as useOrganization does for the
  // organisation page. The failure carries the `id` and `attempt` it
  // belongs to, so moving on hides it without a reset inside the effect.
  const [failure, setFailure] = useState<{ id: number; attempt: number; message: string } | null>(null);
  const error = failure?.id === id && failure.attempt === attempt ? failure.message : null;

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([dispatch(fetchContactById(id)).unwrap(), dispatch(fetchContactHistory(id)).unwrap()]).then(
      ([byId, history]) => {
        if (cancelled) return;
        const failed = byId.status === 'rejected' ? byId.reason : history.status === 'rejected' ? history.reason : null;
        if (failed !== null) setFailure({ id, attempt, message: typeof failed === 'string' ? failed : 'Something went wrong.' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dispatch, id, attempt]);

  const contact = selectedContact?.id === id ? selectedContact : null;
  const history = selectedContactHistory?.contact_id === id ? selectedContactHistory : null;

  if (error) {
    return (
      <Card pad="none">
        <UiErrorState message="Could not open this person" detail={error} onRetry={() => setAttempt((n) => n + 1)} />
      </Card>
    );
  }
  if (!contact || !history) {
    return (
      <Card pad="none">
        <LoadingState label="Loading this person" variant="block" />
      </Card>
    );
  }

  const { organisation, account } = placeOf(contact);
  const email = contact.email ? mailtoHref(contact.email) : null;
  const phone = contact.phone ? telHref(contact.phone) : null;

  return (
    <Card as="article" pad="none" aria-label={contact.name}>
      <CardBody>
      <header className="flex flex-wrap items-start gap-3">
        <Initials text={initials(contact.name)} size="lg" />
        <div className="min-w-0 flex-1 basis-48">
          <h2 className={`min-w-0 break-words ${TYPE.display}`}>{contact.name}</h2>
          <p className={TYPE.bodyMuted}>
            {contact.role_display}
            <span aria-hidden="true"> · </span>
            <span>{contact.status === 'inactive' ? 'Inactive' : 'Active'}</span>
          </p>
          {organisation ? (
            <p className={`flex min-w-0 flex-wrap items-center gap-x-1 ${TYPE.body}`}>
              <Link to={`/organizations/${organisation.id}`} className={ITEM_LINK}>
                {organisation.name}
              </Link>
              {account ? (
                <>
                  <span aria-hidden="true" className="text-ink-muted">
                    ›
                  </span>
                  <Link to={`/organizations/${organisation.id}?account=${account.id}`} className={ITEM_LINK}>
                    {account.name}
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
          <p className={`flex min-w-0 flex-col sm:flex-row sm:flex-wrap sm:gap-x-3 ${TYPE.body}`}>
            {contact.email && email ? (
              <a href={email} className={ITEM_LINK}>
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{contact.email}</span>
              </a>
            ) : contact.email ? (
              <span className="truncate">{contact.email}</span>
            ) : null}
            {contact.phone && phone ? (
              <a href={phone} className={ITEM_LINK}>
                <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className={NUM}>{contact.phone}</span>
              </a>
            ) : contact.phone ? (
              <span className={NUM}>{contact.phone}</span>
            ) : null}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button ref={editButton} type="button" onClick={() => setEditing(true)} className={BUTTON}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit
          </button>
          <Menu
            label={`More actions for ${contact.name}`}
            trigger={<Ellipsis className="h-4 w-4" aria-hidden="true" />}
            triggerClassName={`${ICON_BUTTON} border border-line`}
            items={[
              // Google Calendar delivery 3: invite this person, from their organisation.
              ...(organisation && contact.email ? [{ key: 'meeting', label: 'Schedule meeting', onSelect: () => setScheduling(true) }] : []),
              { key: 'delete', label: 'Delete', onSelect: () => setDeleting(true), danger: true },
            ]}
          />
        </div>
      </header>
      </CardBody>

      {contact.campaigns_unsubscribed_at ? (
        <CardSection>
          <section aria-label="Campaign emails" className={`flex flex-wrap items-center gap-2 ${TYPE.body}`}>
            <MailX className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
            <p className="min-w-0 flex-1">Unsubscribed from campaigns on {dayLabel(contact.campaigns_unsubscribed_at)}</p>
            <button type="button" onClick={() => setResubscribing(true)} className={BUTTON}>
              Re-subscribe
            </button>
          </section>
        </CardSection>
      ) : null}

      <CardSection>
        <section aria-label="Sentiment" className="flex flex-col items-start gap-2">
          <SentimentBadge value={history.sentiment} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className={TYPE.body}>
              {sentimentWhy(
                history.sentiment,
                history.sentiment_source,
                readableEvidenceOf(history),
                history.calls.filter((call) => call.analysis === 'analysed').length,
              )}
            </p>
            <p className={`flex flex-wrap gap-x-2 ${TYPE.meta}`}>
              <span>{contact.last_contacted_at ? `Last contacted ${formatRelativeTime(contact.last_contacted_at)}` : 'Not contacted yet'}</span>
              {history.sentiment_source === 'computed' && contact.sentiment_computed_at ? (
                <span>{`Sentiment read ${formatRelativeTime(contact.sentiment_computed_at)}`}</span>
              ) : null}
            </p>
            {draft ? (
              <button
                type="button"
                onClick={() => draft(whyQuestion(contact.name, history.sentiment), { kind: 'sentiment' })}
                className={`${QUIET} -ml-3 w-fit`}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Why this sentiment?
              </button>
            ) : null}
          </div>
        </section>
      </CardSection>

      <Section title="Calls" count={history.counts.calls} shown={history.calls.length} empty="No calls with them yet.">
        {history.calls.map((call) => (
          <HistoryCallItem key={call.id} call={call} />
        ))}
      </Section>
      <Section title="Emails" count={history.counts.emails} shown={history.emails.length} empty="No emails from them you can see.">
        {history.emails.map((row) => (
          <HistoryEmailItem key={row.id} email={row} />
        ))}
      </Section>
      <Section title="Tickets" count={history.counts.tickets} shown={history.tickets.length} empty="No tickets from them you can see.">
        {history.tickets.map((row) => (
          <HistoryTicketItem key={row.id} ticket={row} />
        ))}
      </Section>

      {editing ? (
        <ContactFormModal
          contact={contact}
          onClose={() => {
            setEditing(false);
            // Back where the edit began, not lost to the page body.
            editButton.current?.focus();
          }}
          // updateContact's reducer patches every list the person is in; the
          // sentiment line and history are the server's reading, so they are
          // read again (a changed sentiment is now a hand-set one), and the
          // page refreshes its summary.
          onSaved={() => {
            setAttempt((n) => n + 1);
            onSaved();
          }}
        />
      ) : null}
      {scheduling && organisation ? <ContactMeetingSheet contact={contact} organisation={organisation} onClose={() => setScheduling(false)} /> : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${contact.name}?`}
          message="This can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await dispatch(deleteContact(contact.id)).unwrap();
            onDeleted();
          }}
          onClose={() => setDeleting(false)}
        />
      ) : null}
      {resubscribing ? (
        <ConfirmDialog
          title={`Re-subscribe ${contact.name}?`}
          message="They will get campaign emails again from the next send. Only do this if they asked."
          confirmLabel="Re-subscribe"
          onConfirm={async () => {
            try {
              await dispatch(updateContact({ id: contact.id, campaigns_unsubscribed: false })).unwrap();
            } catch (err) {
              // ConfirmDialog shows a thrown string as its error.
              throw typeof err === 'string' ? err : 'Could not re-subscribe them. Try again.';
            }
          }}
          onClose={() => setResubscribing(false)}
        />
      ) : null}
    </Card>
  );
}

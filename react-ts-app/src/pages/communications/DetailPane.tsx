import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { ReplyBox } from './ReplyBox';
import { TranslateBlock } from '../../components/shared';
import { DraftLine } from '../../components/agents/DraftLine';
import type { TranslatableKind } from '../../features/translation/translationApi';
import type { CommunicationRow } from '../../features/communications/communicationsSlice';
import { Badge, BUTTON, NO_VALUE, NUM, QUIET, TYPE } from '../../components/ui';

/**
 * The detail pane: what is waiting, the account it is waiting on, and the
 * composer that clears it.
 *
 * The account context strip between the message and the composer is the reason
 * this page exists rather than a mail client. Answering a renewal question
 * without the renewal date in view is the mistake it prevents, so health, ARR,
 * renewal and owner sit above the box a person types into, not on another page.
 */

/** What the composer is called, per channel. One place, so the label, the
 *  button and the hint cannot drift apart. */
const COMPOSER: Record<
  CommunicationRow['action'],
  { label: string; placeholder: string; send: string; hint: string } | null
> = {
  reply: {
    label: 'Reply',
    placeholder: 'Write your reply.',
    send: 'Send reply',
    hint: 'Sends from your connected mailbox',
  },
  answer: {
    label: 'Answer',
    placeholder: 'Your answer is kept as company knowledge on this account.',
    send: 'Send answer',
    hint: 'Stored as a contribution',
  },
  summarise: {
    label: 'Summary',
    placeholder: 'What was decided, and what happens next.',
    send: 'Save summary',
    hint: 'Classifies the call',
  },
  open_external: null,
  none: null,
};

function money(value: number | null): string {
  if (value === null) return '—';
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function ContextStrip({ row }: { row: CommunicationRow }) {
  const context = row.context;
  if (!context || !row.account) return null;

  const renewalTone = context.days_to_renewal !== null && context.days_to_renewal < 0 ? 'text-danger-ink' : 'text-ink';
  const healthTone = context.health_category === 'poor' ? 'text-danger-ink' : context.health_category === 'average' ? 'text-warning-ink' : 'text-ink';

  const cells = [
    { label: 'Health', value: context.health_score?.toFixed(1) ?? NO_VALUE, tone: healthTone, figure: true },
    { label: 'ARR', value: money(context.arr), tone: 'text-ink', figure: true },
    { label: 'Renews in', value: context.days_to_renewal === null ? NO_VALUE : `${context.days_to_renewal}d`, tone: renewalTone, figure: true },
    { label: 'Owner', value: context.owner || 'Unassigned', tone: 'text-ink', figure: false },
  ];

  const href =
    row.account.type === 'customer'
      ? `/organizations/${row.account.id}`
      : `/accounts/${row.account.id}`;

  return (
    <div className="mt-3 flex flex-wrap items-stretch border-y border-line-subtle">
      {cells.map((cell) => (
        <span key={cell.label} className="flex min-w-[6rem] grow flex-col gap-0.5 border-r border-line-subtle px-3 py-2 last:border-r-0">
          <span className={TYPE.meta}>{cell.label}</span>
          <span className={`text-[13px] leading-5 font-semibold ${cell.figure ? NUM : ''} ${cell.tone}`}>{cell.value}</span>
        </span>
      ))}
      <Link to={href} className={`self-center ${QUIET}`}>
        Open account
        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

/** The numeric part of a row id such as "email:412". */
// Which queue rows are a record the backend can translate. A row that is
// not one of these keeps its plain preview.
/** Where an external link points, for its label: "acme.zendesk.com". */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const NO_BODY: Record<string, string> = {
  ticket: 'No description was synced for this ticket, only its subject.',
  email: 'This email arrived without a body we could read.',
  call: 'No transcript or notes were synced for this call.',
};

/** An item that came through with no body (UI broken-things fix 9): tickets
 *  synced with a subject but no description left the pane blank. Says so in
 *  a sentence under the subject and reference the header already shows,
 *  adds the one line the row does carry (how long it has been open), and
 *  links to the record in its source system when the payload carries a URL,
 *  unless the footer below already offers that link. */
function NoBody({ row }: { row: CommunicationRow }) {
  const url = row.external_url && row.action !== 'open_external' ? row.external_url : '';
  const host = url ? hostOf(url) : '';
  const known = row.snippet.trim();
  return (
    <div data-testid="no-body" className="flex max-w-[68ch] flex-col items-start gap-2">
      <p className={TYPE.body}>{NO_BODY[row.kind] ?? 'Nothing more was synced for this item.'}</p>
      {known ? <p className={TYPE.bodyMuted}>{known}</p> : null}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={`mt-1 ${BUTTON}`}
        >
          {host ? `Open in ${host}` : 'Open in the source system'}
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}

const TRANSLATABLE: Record<string, TranslatableKind | undefined> = {
  email: 'email',
  ticket: 'ticket',
  call: 'call',
};

function recordId(row: CommunicationRow): number {
  return Number(row.id.split(':')[1]);
}

export function DetailPane({
  row,
  onReply,
  replying = false,
  replied = false,
  replyError = null,
}: {
  row: CommunicationRow | null;
  /** Sends a reply to an email row from the person's mailbox; only email rows are wired. */
  onReply?: (body: string) => void;
  replying?: boolean;
  replied?: boolean;
  replyError?: string | null;
}) {
  if (!row) {
    return (
      <section aria-label="Selected item" className="flex grow min-w-0 items-center justify-center">
        <p className={TYPE.bodyMuted}>Choose something from the queue to read it.</p>
      </section>
    );
  }

  const composer = COMPOSER[row.action];

  return (
    <section aria-label="Selected item" aria-live="polite" className="flex grow min-w-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-line-subtle px-4 pb-3 pt-1">
        <div className="flex items-start gap-3">
          <div className="grow min-w-0">
            <h2 className={`mb-1 ${TYPE.title}`}>{row.subject}</h2>
            <p className={`flex flex-wrap items-center gap-x-2 ${TYPE.meta}`}>
              <span className="font-semibold text-ink">{row.who}</span>
              {row.detail ? <span>{row.detail}</span> : null}
              {row.account ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-ink">{row.account.name}</span>
                </>
              ) : null}
            </p>
          </div>
          <Badge>
            Waiting <span className={NUM}>{row.waiting_days}</span> {row.waiting_days === 1 ? 'day' : 'days'}
          </Badge>
        </div>

        <ContextStrip row={row} />
      </div>

      <div className="grow overflow-y-auto px-4 py-3">
        {!row.preview.trim() ? (
          <NoBody row={row} />
        ) : TRANSLATABLE[row.kind] ? (
          // Keyed by the record: switching rows must not leave the last
          // one's translation on screen under this one's name.
          <TranslateBlock
            key={row.id}
            kind={TRANSLATABLE[row.kind]!}
            id={recordId(row)}
            text={row.preview}
          />
        ) : (
          <p className={`max-w-[68ch] whitespace-pre-line ${TYPE.body}`}>
            {row.preview}
          </p>
        )}
      </div>

      {row.draft ? (
        <div className="shrink-0 px-4 pb-3">
          <DraftLine draft={row.draft} />
        </div>
      ) : null}

      {composer ? (
        <ReplyBox
          key={row.id}
          label={composer.label}
          placeholder={composer.placeholder}
          hint={composer.hint}
          sendLabel={composer.send}
          draftSource={row.kind === 'email' ? { kind: 'email', id: recordId(row) } : undefined}
          theirLanguage={row.writer_language || undefined}
          onSend={row.action === 'reply' ? onReply : undefined}
          sending={replying}
          sent={replied}
          error={replyError}
        />
      ) : row.action === 'open_external' && row.external_url ? (
        <div className="shrink-0 px-4 pb-4">
          <a
            href={row.external_url}
            target="_blank"
            rel="noreferrer"
            className={BUTTON}
          >
            {row.kind === 'slack' ? 'Open in Slack' : 'Open in the source system'}
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      ) : null}
    </section>
  );
}

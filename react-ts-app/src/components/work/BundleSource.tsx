import { ExternalLink } from 'lucide-react';
import { meetingSlotText, openInLabel, openInText, sourceParts } from '../../features/agents/bundleText';
import type { MeetingSource as Meeting, BundleSource as Source, SlackMessageSource } from '../../features/agents/bundleTypes';
import { whenText } from '../../features/agents/whenText';
import { MetaParts, NUM, TYPE } from '../ui';
import { CHANNEL_ICON, KIND_ICON, MEETING_ICON, META_LINK, OnlyYou } from './FeedRowParts';

/** Where a message bundle came from (spec §8.2; Decision 3): channel, ticket,
 *  sender, message count, when, and the ticket in its own tool. Nothing for
 *  the nightly review, which the meta line already names. The words flow
 *  inline with " · " ending each part, so a wrap never starts with one. */
export function BundleSource({ source }: { source: Source }) {
  if (source.kind === 'slack_message') return <SlackSource source={source} />;
  if (source.kind === 'meeting') return <MeetingSource source={source} />;
  if (source.kind !== 'thread' || source.channel === null) return null;
  const Icon = CHANNEL_ICON[source.channel];
  const parts = sourceParts(source);
  return (
    <p data-testid="bundle-source" className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${TYPE.meta}`}>
      <Icon className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <span className="min-w-0">
        <MetaParts parts={[...parts.map((part, index) => (index > 0 ? <span className={NUM}>{part}</span> : part)), source.last_message_at ? <span className={NUM}>{whenText(source.last_message_at)}</span> : null]} />
      </span>
      {source.link ? (
        <a href={source.link} target="_blank" rel="noopener noreferrer" aria-label={openInText(source.label)} className={`${META_LINK} gap-1`}>
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          {openInLabel(source.label)}
        </a>
      ) : null}
    </p>
  );
}

const SLACK = 'Slack';

/** Slack bundles (2026-10-17): the message its sender sent to Work, who sent
 *  it, when, its opening words as a quote, the message in Slack and "Only
 *  you". Once the message is dismissed or purged only the label is left. */
function SlackSource({ source }: { source: SlackMessageSource }) {
  const Icon = KIND_ICON.slack_message;
  const link = source.link && source.link.startsWith('https://') ? source.link : null;
  return (
    <div data-testid="bundle-source" className="flex flex-col gap-2">
      <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${TYPE.meta}`}>
        <Icon className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <span className="min-w-0">
          <MetaParts parts={[sourceParts(source)[0], source.at ? <span className={NUM}>{whenText(source.at)}</span> : null, source.private ? <OnlyYou /> : null]} />
        </span>
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" aria-label={openInText(SLACK)} className={`${META_LINK} gap-1`}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {openInLabel(SLACK)}
          </a>
        ) : null}
      </p>
      {source.excerpt ? (
        <blockquote data-part="excerpt" className={`${TYPE.bodyMuted} max-w-[68ch] whitespace-pre-line break-words border-l-2 border-line pl-3`}>
          {source.excerpt}
        </blockquote>
      ) : null}
    </div>
  );
}

/** Sales review report (2026-10-18): the meeting the report is for, its
 *  slot in the reader's time ("Tue 10:00–11:00") and "Only you". */
function MeetingSource({ source }: { source: Meeting }) {
  const slot = meetingSlotText(source.starts_at, source.ends_at);
  return (
    <p data-testid="bundle-source" className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${TYPE.meta}`}>
      <MEETING_ICON className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <span className="min-w-0 break-words">
        <MetaParts parts={[...sourceParts(source), slot ? <span className={NUM}>{slot}</span> : null, source.private ? <OnlyYou /> : null]} />
      </span>
    </p>
  );
}

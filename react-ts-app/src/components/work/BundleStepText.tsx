import { BUNDLE, OUTSIDE } from '../../features/agents/bundleText';
import type { BundleStep } from '../../features/agents/bundleTypes';
import { TYPE } from '../ui';
import { PlaceholderText } from './PlaceholderText';

/** The text fields each outside kind would post, in the order they read. */
const SHOWN: Record<string, [string, string][]> = {
  'slack.reply': [['text', OUTSIDE.MESSAGE]],
  'mail.send_reply': [
    ['to', OUTSIDE.TO],
    ['subject', BUNDLE.SUBJECT],
    ['body', OUTSIDE.REPLY],
  ],
  'jira.create': [
    ['summary', OUTSIDE.SUMMARY],
    ['description', OUTSIDE.DESCRIPTION],
  ],
  'jira.comment': [['body', OUTSIDE.COMMENT]],
};

/** A field's words: a string, or a list of addresses joined by commas. */
function wordsOf(value: unknown): string {
  if (typeof value === 'string') return value.trim() ? value : '';
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string').join(', ');
  return '';
}

/** A step its tool blocks shows what it would post, read only (round 2 D2
 *  frontend Decision 6), so the text can be checked while the tool is fixed. */
export function BundleStepText({ step }: { step: BundleStep }) {
  const rows = (SHOWN[step.kind] ?? []).map(([key, label]) => [key, label, wordsOf(step.fields[key])] as const).filter(([, , text]) => text);
  if (rows.length === 0) return null;
  return (
    <dl className="flex flex-col gap-2">
      {rows.map(([key, label, text]) => (
        <div key={key} className="flex flex-col gap-1">
          <dt className={TYPE.label}>{label}</dt>
          <dd className={`${TYPE.body} whitespace-pre-line break-words`}>
            <PlaceholderText text={text} placeholders={step.placeholders} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

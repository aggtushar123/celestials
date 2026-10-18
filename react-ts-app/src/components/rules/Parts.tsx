import type { SentencePart } from '../../features/segments/ruleSentence';
import { NUM } from '../ui';

/** Words and figures inline: a numeric part tabular. */
export function Parts({ parts }: { parts: SentencePart[] }) {
  return (
    <>
      {parts.map((part, index) => (
        <span key={index} className={part.numeric ? NUM : undefined}>
          {part.text}
        </span>
      ))}
    </>
  );
}

import { textParts } from '../../features/agents/bundleText';
import type { Placeholder } from '../../features/agents/bundleTypes';
import { TYPE } from '../ui';

/** Text with each `{{step N.key}}` as a chip (frontend Decision 10). */
export function PlaceholderText({ text, placeholders }: { text: string; placeholders: Placeholder[] }) {
  return (
    <>
      {textParts(text, placeholders).map((part, index) =>
        typeof part === 'string' ? (
          <span key={index}>{part}</span>
        ) : (
          <span key={index} data-part="placeholder" className={`mx-0.5 inline-flex items-center rounded-full border border-line bg-subtle px-2 ${TYPE.body} font-semibold`}>
            {part.chip}
          </span>
        ),
      )}
    </>
  );
}

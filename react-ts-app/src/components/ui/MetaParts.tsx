import { Fragment, type ReactNode } from 'react';

/** A meta line's parts (spec §7: " · " between items): each kept part its
 *  own span ending " ·" except the last, so a line that wraps or truncates
 *  never strands a separator at the start of a part. */
export function MetaParts({ parts }: { parts: readonly ReactNode[] }) {
  const shown = parts.filter((part) => part !== null && part !== undefined && part !== false && part !== '');
  return (
    <>
      {shown.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? ' ' : null}
          <span>
            {part}
            {index < shown.length - 1 ? ' ·' : ''}
          </span>
        </Fragment>
      ))}
    </>
  );
}

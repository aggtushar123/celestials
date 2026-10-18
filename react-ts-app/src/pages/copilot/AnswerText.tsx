// The Copilot's answer as structure. Answers arrive as plain text with the
// shapes a model reaches for (numbered steps, bullets, **emphasis**,
// `identifiers`); rendering those as paragraphs, lists, strong and code
// is what keeps a long answer readable. Deliberately small: no markdown
// dependency for four constructs, and nothing here renders HTML.

import type { ReactNode } from 'react';

const ORDERED = /^\s*\d+[.)]\s+/;
const BULLET = /^\s*[-*•]\s+/;
const HEADING = /^\s*#{1,3}\s+/;

function inline(text: string): ReactNode[] {
  // **bold** and `code`, left to right.
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > last) out.push(text.slice(last, index));
    const token = match[0];
    if (token.startsWith('**')) out.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    else out.push(<code key={key++} className="font-mono-brand text-[0.92em] px-1 py-0.5 rounded bg-subtle text-ink">{token.slice(1, -1)}</code>);
    last = index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function lines(block: string): ReactNode[] {
  return block.split('\n').flatMap((line, i) => (i === 0 ? inline(line) : [<br key={`br-${i}`} />, ...inline(line)]));
}

/** Models often put a blank line between numbered items; those blocks are
 *  one list, not several lists that each start at 1. */
function coalesce(blocks: string[]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    const rows = block.split('\n');
    const prev = out[out.length - 1];
    const isOrdered = rows.every((r) => ORDERED.test(r));
    const isBullet = rows.every((r) => BULLET.test(r));
    const prevRows = prev?.split('\n') ?? [];
    if (prev && ((isOrdered && prevRows.every((r) => ORDERED.test(r))) || (isBullet && prevRows.every((r) => BULLET.test(r))))) {
      out[out.length - 1] = `${prev}\n${block}`;
    } else {
      out.push(block);
    }
  }
  return out;
}

export function AnswerText({ text }: { text: string }) {
  const blocks = coalesce(text.replace(/\r\n/g, '\n').trim().split(/\n{2,}/));
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => {
        const rows = block.split('\n');
        if (rows.every((r) => ORDERED.test(r))) {
          return (
            <ol key={i} className="list-decimal pl-5 flex flex-col gap-1.5 marker:text-ink-faint marker:font-mono-brand marker:text-[0.85em]">
              {rows.map((r, j) => (
                <li key={j} value={Number((r.match(/\d+/) ?? ['1'])[0])}>
                  {inline(r.replace(ORDERED, ''))}
                </li>
              ))}
            </ol>
          );
        }
        if (rows.every((r) => BULLET.test(r))) {
          return (
            <ul key={i} className="list-disc pl-5 flex flex-col gap-1.5 marker:text-ink-faint">
              {rows.map((r, j) => (
                <li key={j}>{inline(r.replace(BULLET, ''))}</li>
              ))}
            </ul>
          );
        }
        if (rows.length === 1 && HEADING.test(block)) {
          return (
            <h3 key={i} className="text-[14px] font-semibold text-ink mt-1">
              {inline(block.replace(HEADING, ''))}
            </h3>
          );
        }
        return <p key={i}>{lines(block)}</p>;
      })}
    </div>
  );
}

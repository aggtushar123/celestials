import { useEffect, useState } from 'react';

/** A search box's text: what is typed shows at once, and `commit` gets it
 *  (trimmed) 300ms after typing stops. When `committed` changes from outside
 *  (a chip, "Clear all"), the box follows it (adjusted during render, not
 *  in an effect). `commit` should be stable. */
export function useSearchText(committed: string, commit: (text: string) => void): [string, (text: string) => void] {
  const [text, setText] = useState(committed);
  const [synced, setSynced] = useState(committed);
  if (committed !== synced) {
    setSynced(committed);
    setText(committed);
  }
  useEffect(() => {
    if (text.trim() === committed) return;
    const timeout = window.setTimeout(() => commit(text.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [text, committed, commit]);
  return [text, setText];
}

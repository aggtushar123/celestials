/** Ends `text` with a full stop, unless it already ends a sentence: a title
 *  that ends in "?", "!", "." or "…" (perhaps inside a closing quote or
 *  bracket) gets nothing, so a toast never reads "discount?.". */
export function sentence(text: string): string {
  const trimmed = text.trimEnd();
  return /[.?!…]["'”’)\]]*$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

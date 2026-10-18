import { NUM } from '../ui';

/** A figure: an optional sign, an optional currency mark, digits, then K/M/B/T or %.
 *  It ends on a digit (or its unit), so a comma or full stop after a number
 *  stays with the sentence, not inside the figure span (UI broken-things fix 10). */
const FIGURE = /([+−-]?[$€£₹]?\d(?:[\d.,]*\d)?[KMBT%]?)/;

/** A sentence with every figure in it (money, counts, scores, dates) set in
 *  tabular figures (the body font), and the words around them left alone. */
export function Figured({ text }: { text: string }) {
  // One inline span around the whole sentence: inside a flex parent (a link
  // styled inline-flex for its touch target) bare text nodes would each
  // become a flex item, losing the spaces at their edges ("renews2027") and
  // wrapping as narrow columns (fix 10).
  return (
    <span>
      {text.split(FIGURE).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className={NUM}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </span>
  );
}

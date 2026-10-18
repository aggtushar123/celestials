// Evidence labels arrive as the agent's own working notes (UI broken-things
// fix 10): "- account:11: \"Oracle Cloud Division\", owner ...",
// "Seat utilisation [seat_utilisation]: 59.6%", "7: Pizza Hut ...",
// "at_risk_arr by product: 4: Product B = 64090.0". The link beside each one
// already carries the record, so the internal references are dropped and the
// rest is read as written. A server-side cleanup should follow; this keeps
// the page readable until then.

const ACRONYMS = new Set(['arr', 'mrr', 'nps', 'csm', 'ai', 'qbr']);

/** `at_risk_arr` → "At risk ARR". */
function humanise(key: string): string {
  const words = key.split('_').map((word) => (ACRONYMS.has(word) ? word.toUpperCase() : word));
  const first = words[0] ?? '';
  return [first.charAt(0).toUpperCase() + first.slice(1), ...words.slice(1)].join(' ');
}

export function evidenceLabel(raw: string): string {
  let label = raw.trim();
  // A list bullet the model wrote.
  label = label.replace(/^[-*•]\s+/, '');
  // A record reference the agents' context uses ("account:11: ",
  // "customer:19: "), or the bare id the figures block puts before a name and
  // its em dash ("7: Pizza Hut \u2014 owner ..."; metrics/proposals.py). Never a
  // time ("10:30"), a year ("2026: ...") or a host ("localhost:8000: ...").
  label = label.replace(/^(?:(?:customer|account):\d+|\d{1,6}(?=:\s+[^:]*\s\u2014\s)):\s+/, '');
  // A record name quoted at the start: "Oracle Cloud Division", owner ...
  label = label.replace(/^"([^"]+)"/, '$1');
  // A metric key in brackets after its own label: "Seat utilisation [seat_utilisation]".
  // Only a lower snake_case key right before its colon: "[EU]" and "[P1]" stay.
  label = label.replace(/\s*\[[a-z0-9]+(?:_[a-z0-9]+)+\](?=:)/g, '');
  // A snake_case key leading the line: "at_risk_arr by product".
  // Followed by a space, so "john_doe@acme.com" stays.
  label = label.replace(/^([a-z]+(?:_[a-z0-9]+)+)(?=\s)/, (key) => humanise(key));
  // A cut's member id after its dimension (metrics/proposals.py:
  // "{metric} by {dimension}: {member}: {label} = {value}"), not any
  // "Score: 4: ...".
  label = label.replace(/(\bby \w+): \d+: /g, '$1: ');
  return label;
}

// Small helpers for the Connections forms (live-test fixes). No em dash.

/** The provider's name for a new connection, or the first "Name 2",
 *  "Name 3"... that no existing connection of that provider has. The
 *  server still has the last word: its refusal shows if it says no. */
export function uniqueName(base: string, taken: readonly string[]): string {
  const used = new Set(taken.map((name) => name.trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  let n = 2;
  while (used.has(`${base} ${n}`.toLowerCase())) n += 1;
  return `${base} ${n}`;
}

/** The fields that name a tenant's host ("acme" or "acme.atlassian.net"):
 *  a pasted full URL keeps just its host. */
export const HOST_FIELDS: readonly string[] = ['site', 'subdomain', 'domain'];

/** "https://acme.atlassian.net/jira/..." to "acme.atlassian.net"; a bare
 *  tenant name is left as it is (trimmed, lower case). */
export function hostOnly(value: string): string {
  return value
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .split(/[/?#]/)[0]
    .toLowerCase();
}

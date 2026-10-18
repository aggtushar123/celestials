/** Keep the previous reference when a report changes nothing (deep equal by
 *  JSON), so a value built from it (a chip's callback, an AskProvider's
 *  surface) doesn't churn on every render that reports the same thing again.
 *  Shared by the Organizations, Contacts and Accounts Ask layouts. */
export function same<T>(prev: T, next: T): T {
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}

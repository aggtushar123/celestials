// What the chat says about session decisions this reader can't see in
// full (as Brain's desk rows did), for the same privacy rule (SOC2:AUTH-02): a reader
// without view_all_accounts never sees a task proposal naming a customer
// they can't open, only a count of how many were left out.
export function hiddenDecisionsText(n: number): string | null {
  if (n <= 0) return null;
  return n === 1
    ? "1 more decision about a record you can't open"
    : `${n} more decisions about records you can't open`;
}

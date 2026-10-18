/** A response rate, "74%"; with nothing to count (`null`), a dash for the
 *  eye and the reason for a screen reader. */
export function Rate({ rate, isOwner }: { rate: number | null; isOwner: boolean }) {
  if (rate !== null) return <>{rate}%</>;
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{isOwner ? 'No response rate: nobody received it' : 'No response rate: nobody you can open received it'}</span>
    </>
  );
}

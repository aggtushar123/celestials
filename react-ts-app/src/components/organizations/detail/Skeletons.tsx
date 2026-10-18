import { Card, LoadingState } from '../../ui';

/** A tab's content before the page's row lands. */
export function TabSkeleton({ label }: { label: string }) {
  return (
    <Card pad="none">
      <LoadingState label={label} variant="block" />
    </Card>
  );
}

/** The name row and the four tiles before the page's row lands. */
export function HeaderSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-3">
      <LoadingState label={label} variant="tiles" count={4} />
    </div>
  );
}

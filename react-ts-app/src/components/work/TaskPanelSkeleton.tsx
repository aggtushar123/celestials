/** The panel while the task loads: its fields and two lines of activity. */
export function TaskPanelSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the task" className="flex flex-col gap-4">
      <div className="h-9 w-full animate-pulse rounded-lg bg-subtle" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((n) => (
          <div key={n} className="h-12 animate-pulse rounded-lg bg-subtle" />
        ))}
      </div>
      <div className="h-3 w-2/3 animate-pulse rounded-md bg-subtle" />
      <div className="h-3 w-1/2 animate-pulse rounded-md bg-subtle" />
    </div>
  );
}

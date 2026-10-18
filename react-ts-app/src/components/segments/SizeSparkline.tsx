/** A segment's size over its last 30 days (oldest first), scaled to its own
 *  range; level when it never moved, dashed before any history. */
export function SizeSparkline({ sizes }: { sizes: number[] }) {
  const width = 64;
  const height = 20;
  const low = Math.min(...sizes);
  const high = Math.max(...sizes);
  const y = (size: number) => (high === low ? height / 2 : height - 2 - ((size - low) / (high - low)) * (height - 4));
  const points =
    sizes.length < 2 ? '' : sizes.map((size, i) => `${((i / (sizes.length - 1)) * width).toFixed(1)},${y(size).toFixed(1)}`).join(' ');
  const label =
    sizes.length === 0
      ? 'No size history yet'
      : sizes.length === 1
        ? `Size today: ${sizes[0]}, no history yet`
        : `Size over 30 days: ${sizes[0]} to ${sizes[sizes.length - 1]}`;
  return (
    <span role="img" aria-label={label} className="inline-flex shrink-0 text-ink-muted">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-5 w-16" aria-hidden="true">
        {points ? (
          <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        ) : (
          <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" strokeDasharray="2 3" />
        )}
      </svg>
    </span>
  );
}

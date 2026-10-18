import type { SegmentKind, SegmentSummary } from '../../features/segments/segmentTypes';
import { summaryFigures } from '../../features/segments/summaryFigures';
import { Card, ErrorState, LoadingState, Tile, tileRow } from '../ui';

/** The tiles (spec §3; UI foundations spec §4.3) over every member the
 *  reader may open; a search on the Members tab narrows the rows, never
 *  these. One anatomy each, n-up once the page's @container is 50rem; a
 *  sideways strip on phones (the page never scrolls sideways). */
export function SegmentTiles({ summary, kind, failed, onRetry }: { summary: SegmentSummary | null; kind: SegmentKind; failed: boolean; onRetry: () => void }) {
  if (failed) {
    return (
      <Card pad="none">
        <ErrorState message="Could not load the totals." detail="The members below are not affected." onRetry={onRetry} />
      </Card>
    );
  }
  if (!summary) return <LoadingState label="Loading the totals" variant="tiles" count={kind === 'contact' ? 2 : 5} />;
  const figures = summaryFigures(summary, kind);
  const columns = Math.min(5, Math.max(2, figures.length)) as 2 | 3 | 4 | 5;
  return (
    <div className={tileRow(columns, 'container')}>
      {figures.map((figure) => (
        <Tile key={figure.key} label={figure.label} value={figure.value} meta={figure.detail ?? undefined} />
      ))}
    </div>
  );
}

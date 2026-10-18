import { Sparkles } from 'lucide-react';
import { fetchBrief, writeBrief } from '../../features/brain/brainApi';
import { SAY, writtenLine } from '../../features/brain/brainText';
import type { ScopeBrief, ScopeKey } from '../../features/brain/brainTypes';
import { BUTTON, Card, LoadingState, PRIMARY, TYPE } from '../ui';
import { useKept } from './useKept';

/** The scope's brief (spec §2.3 item 2): a 15px title over one card, with
 *  Write/Write again to the title row's right. Never written
 *  on load: a brief is a paid model call, so writing is a button that
 *  says so. */
export function ScopeBriefCard({ scope, scopeLabel, onRefused }: { scope: ScopeKey; scopeLabel: string; onRefused: (err: unknown) => boolean }) {
  const kept = useKept<ScopeBrief>({
    read: () => fetchBrief(scope).then((p) => p.brief),
    write: () => writeBrief(scope).then((p) => p.brief),
    onRefused,
    readFallback: SAY.LOAD_BRIEF,
    writeFallback: SAY.WRITE_FAILED,
  });
  const brief = kept.value;
  // Never offer a write beside a failed read (I1): "None yet" only means a
  // successful read with nothing kept, not a read that errored.
  const offerWrite = (brief === null && !kept.loadError) || Boolean(brief?.stale);
  const label = kept.writing ? SAY.WRITING : brief ? SAY.WRITE_AGAIN : scope === 'company' ? SAY.WRITE_COMPANY : SAY.WRITE_MINE;

  return (
    <section aria-labelledby="brief-heading" className="flex flex-col gap-2">
      {/* The same heading row as What moved's (MovesList), so the two cards
          start level side by side. "Uses AI credits." sits in the card
          below, near the write action it explains. */}
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        <h2 id="brief-heading" className={TYPE.title}>
          {SAY.BRIEF}
        </h2>
        {offerWrite ? (
          <button type="button" onClick={kept.save} disabled={kept.writing} className={brief ? BUTTON : PRIMARY}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ) : null}
      </div>
      <Card className="flex flex-col gap-3">
        {brief === undefined && !kept.loadError ? <LoadingState label="Loading the brief" variant="block" /> : null}
        {kept.loadError ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className={TYPE.bodyMuted}>{kept.loadError}</p>
            <button type="button" onClick={kept.retry} className={BUTTON}>
              Try again
            </button>
          </div>
        ) : null}
        {brief ? (
          <article className="flex flex-col gap-3">
            <h3 className={TYPE.title}>{brief.headline}</h3>
            <div className="flex max-w-[68ch] flex-col gap-2">
              {brief.body.split(/\n\s*\n/).map((paragraph, index) => (
                <p key={index} className={TYPE.bodyMuted}>
                  {paragraph}
                </p>
              ))}
            </div>
            {brief.watch.length ? (
              <div className="flex flex-col gap-1">
                <h4 className={TYPE.label}>{SAY.WATCH}</h4>
                <ul className="flex max-w-[68ch] list-disc flex-col gap-1 pl-5">
                  {brief.watch.map((item, index) => (
                    <li key={`${index}-${item}`} className={TYPE.bodyMuted}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className={TYPE.meta}>{writtenLine(brief, scopeLabel)}</p>
          </article>
        ) : null}
        {brief?.stale ? <p className={TYPE.bodyMuted}>{SAY.STALE_BRIEF}</p> : null}
        {offerWrite ? <p className={TYPE.meta}>{SAY.CREDITS}</p> : null}
        {kept.writeError ? (
          <p role="alert" className="text-[13px] leading-5 text-danger-ink">
            {kept.writeError}
          </p>
        ) : null}
      </Card>
    </section>
  );
}

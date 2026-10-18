import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { OUTSIDE, isAppPath, isExternal } from '../../features/agents/bundleText';
import type { StepLink } from '../../features/agents/bundleTypes';
import { LINK } from '../brain/styles';

/** A step's result links (contract §4.1, D3-16; frontend Decision 9): app
 *  paths in the app, the tool's own https pages in a new tab. */
export function StepLinks({ links }: { links: StepLink[] }) {
  const shown = links.filter((l) => (l.external ? isExternal(l) : isAppPath(l.url)));
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {shown.map((l) =>
        l.external ? (
          <a key={l.url + l.label} href={l.url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 ${LINK}`}>
            {l.label}{' '}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">{OUTSIDE.OPENS_NEW_TAB}</span>
          </a>
        ) : (
          <Link key={l.url + l.label} to={l.url} className={LINK}>
            {l.label}
          </Link>
        ),
      )}
    </div>
  );
}

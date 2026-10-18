import { Link } from 'react-router-dom';
import { Mail, FileText, LifeBuoy, CheckCircle, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MessageSource } from './types';
import { hrefOf } from './sourceHref';

const ICONS: Record<MessageSource['type'], ReactNode> = {
  email: <Mail className="w-3 h-3" />,
  note: <FileText className="w-3 h-3" />,
  ticket: <LifeBuoy className="w-3 h-3" />,
  activity: <CheckCircle className="w-3 h-3" />,
  // A colleague's note from another function — see services.knowledge.
  contribution: <Users className="w-3 h-3" />,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-03-15" -> "15 Mar" — parsed by hand rather than through
 * `Date`, same reasoning as every other date in this app: a date-only
 * string run through `Date` shifts a day in some timezones. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  // `Number.isFinite`, not `Number.isNaN`: a string with no dashes
  // destructures to `undefined` rather than NaN, and
  // `Number.isNaN(undefined)` is false — so the guard never fired and
  // an unparseable date rendered as "undefined undefined".
  if (!Number.isFinite(m) || !Number.isFinite(d)) return iso;
  return `${d} ${MONTHS[m - 1]}`;
}

/**
 * The records an answer was built from, shown under it.
 *
 * The Copilot has always retrieved real emails, notes and tickets and
 * put them in the prompt — but the answer arrived as bare prose, so
 * "where did that come from?" had no answer and the grounding was
 * something you had to take on trust.
 *
 * Each citation links to the company the record belongs to rather than
 * to the record itself: there's no per-record detail page anywhere in
 * this app, and the company's own activity feed is where the record
 * actually lives. A citation whose record has since been deleted still
 * renders — it's a snapshot — and its link lands on the company, which
 * is the honest outcome rather than a dead end.
 */
export function MessageSources({ sources }: { sources: MessageSource[] }) {
  if (sources.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mt-4">
      <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-faint">
        Based on {sources.length} {sources.length === 1 ? 'record' : 'records'}
      </span>
      <div className="flex flex-wrap gap-2">
        {sources.map((source) => (
          <Link
            key={`${source.type}-${source.id}`}
            to={hrefOf(source)}
            title={`${source.label} — ${source.company}`}
            className="group flex items-center gap-1.5 max-w-[280px] rounded-lg border border-line-subtle bg-surface px-2.5 py-1.5 hover:border-accent/40 hover:bg-subtle/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="text-ink-faint group-hover:text-accent transition-colors shrink-0">
              {ICONS[source.type]}
            </span>
            <span className="text-[12px] font-semibold text-ink-muted truncate group-hover:text-ink transition-colors">
              {source.label}
            </span>
            <span className="text-[11px] text-ink-faint shrink-0 whitespace-nowrap">
              {source.company} · {shortDate(source.date)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

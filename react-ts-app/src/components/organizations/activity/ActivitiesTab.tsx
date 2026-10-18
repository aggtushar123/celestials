import { CheckCircle, ExternalLink, MoreHorizontal, Sparkles, Eye, Link2 } from 'lucide-react';
import type { Activity } from '../../../features/customers/customersSlice';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

// "2026-03-05" -> "Mar 5th" — the card's own date display. Parsed
// manually (not via `Date`) to avoid a local-timezone day shift, same
// reasoning as formatDate in features/customers/formatters.ts.
function formatCardDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${ordinal(d)}`;
}

// "2026-03-05" -> "5 Mar 2026" — the timeline's day-group header. No
// separate stored "group" field on the backend — this is derived from
// occurred_at instead of duplicating a different string format of the
// same date (see the Activity model's own docstring).
function formatGroupHeader(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export interface ActivitiesTabProps {
  activities: Activity[];
  isLoading: boolean;
  error: string | null;
  healthColor?: string;
}

export function ActivitiesTab({ activities, isLoading, error, healthColor = 'bg-success' }: ActivitiesTabProps) {
  const grouped = activities.reduce<Record<string, Activity[]>>((acc, act) => {
    if (!acc[act.occurred_at]) acc[act.occurred_at] = [];
    acc[act.occurred_at].push(act);
    return acc;
  }, {});

  // occurred_at is already "YYYY-MM-DD" — sorts correctly as a plain
  // string, no need to go through Date.
  const sortedGroups = Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-16 opacity-40">
        <span className="text-sm font-semibold text-ink-faint">Loading activities…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-16">
        <span className="text-sm font-semibold text-danger">{error}</span>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-16 opacity-40">
        <CheckCircle className="w-10 h-10 text-ink-faint mb-2" />
        <span className="text-sm font-semibold text-ink-faint">No activities found</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-subtle/20">
      <div className="flex flex-col gap-8 relative">
        <div className="absolute left-[13px] top-10 bottom-4 w-0.5 bg-accent-dim" />
        {sortedGroups.map(([group, items]) => (
          <div key={group} className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-[28px] h-[28px] rounded-full bg-surface border border-accent/20 flex items-center justify-center shrink-0 z-10">
                <div className="w-3 h-3 border-2 border-accent/40 rounded-md" />
              </div>
              <span className="text-[11px] font-bold text-ink-faint uppercase tracking-wider">{formatGroupHeader(group)}</span>
            </div>
            <div className="flex flex-col gap-4 ml-[13px] pl-[15px]">
              {items.map(activity => (
                <ActivityCard key={activity.id} activity={activity} healthColor={healthColor} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityCard({ activity, healthColor }: { activity: Activity; healthColor: string }) {
  return (
    <div className="bg-surface rounded-xl border border-line-subtle shadow-sm overflow-hidden p-5 flex flex-col gap-4 relative group cursor-pointer hover:border-accent/30 transition-all">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-success-dim text-success flex items-center justify-center border border-success/30">
            <CheckCircle className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-ink text-[14px] group-hover:text-accent transition-colors">{activity.type_display}</h4>
            <ExternalLink className="w-3 h-3 text-ink-faint" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] font-bold text-ink-faint pr-5">{formatCardDate(activity.occurred_at)}</span>
          <MoreHorizontal className="w-4 h-4 text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" />
        </div>
      </div>
      <div className="flex items-center gap-4 pl-9">
        <div className={`w-3 h-3 rounded-full ${healthColor}`} />
        <div className="flex items-center gap-1 text-[11px] font-bold text-accent px-2 py-0.5 bg-accent-dim/50 rounded-md border border-accent/30">
          <Sparkles className="w-3 h-3" />
          Pulse
        </div>
        {activity.watchers > 0 && (
          <div className="flex items-center gap-1 text-[11px] font-medium text-ink-faint">
            <Eye className="w-3 h-3" />
            <span>{activity.watchers}</span>
          </div>
        )}
        {activity.links > 0 && (
          <div className="flex items-center gap-1 text-[11px] font-medium text-accent">
            <Link2 className="w-3 h-3" />
            <span>{activity.links} Links</span>
          </div>
        )}
      </div>
    </div>
  );
}

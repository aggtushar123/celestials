import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { fetchOverview } from '../../features/platform/platformSlice';

export function PlatformOverview() {
  const dispatch = useAppDispatch();
  const { overview, error } = useAppSelector((state) => state.platform);

  useEffect(() => {
    dispatch(fetchOverview());
  }, [dispatch]);

  const tiles = overview
    ? [
        { label: 'Organisations', value: overview.organisations.total, hint: `${overview.organisations.active} active · ${overview.organisations.suspended} suspended`, to: '/platform/organisations' },
        { label: 'Active members', value: overview.members_active, hint: 'across every tenant' },
        { label: 'Waiting to join', value: overview.pending_requests, hint: 'access requests pending an owner' },
        { label: 'Open invitations', value: overview.open_invitations, hint: 'sent, not yet accepted' },
        { label: 'Verified domains', value: overview.verified_domains, hint: 'route sign-ins automatically' },
        {
          label: 'Google mailboxes',
          value: overview.gmail.connected,
          hint: `of ${overview.gmail.test_user_cap} test users · ${overview.gmail.enabled_workspaces} ${overview.gmail.enabled_workspaces === 1 ? 'workspace' : 'workspaces'} on`,
        },
        { label: 'Staff', value: overview.staff, hint: 'platform accounts', to: '/platform/staff' },
      ]
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight text-ink">Overview</h1>
        <p className="text-[13px] text-ink-muted mt-1">Every organisation on Revenact, by the numbers. Metadata only.</p>
      </div>
      {error && (
        <div role="alert" className="flex items-center gap-2 text-[12px] text-danger p-3 bg-danger-dim rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {tiles.map((tile) => {
          const body = (
            <>
              <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-ink-faint">{tile.label}</div>
              <div className="text-[28px] font-semibold text-ink mt-1 tabular-nums">{tile.value}</div>
              <div className="text-[11.5px] text-ink-muted">{tile.hint}</div>
            </>
          );
          return tile.to ? (
            <Link key={tile.label} to={tile.to} className="rv-card rv-card-interactive p-4 block">
              {body}
            </Link>
          ) : (
            <div key={tile.label} className="rv-card p-4">
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PlatformOverview;

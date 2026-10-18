import { useEffect } from 'react';
import { AlertCircle, ShieldCheck, ShieldOff } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { fetchStaff } from '../../features/platform/platformSlice';

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'never';
}

export function PlatformStaff() {
  const dispatch = useAppDispatch();
  const { staff, error } = useAppSelector((state) => state.platform);

  useEffect(() => {
    dispatch(fetchStaff());
  }, [dispatch]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight text-ink">Staff</h1>
        <p className="text-[13px] text-ink-muted mt-1">
          Who holds platform access, and whether their second factor is on. Staff accounts are created by an existing superuser; there is no self-serve path.
        </p>
      </div>
      {error && (
        <div role="alert" className="flex items-center gap-2 text-[12px] text-danger p-3 bg-danger-dim rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}
      <ul className="rv-card divide-y divide-line-subtle">
        {staff.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-ink truncate">{member.name}</div>
              <div className="text-[11.5px] text-ink-muted truncate">
                {member.email} · last sign-in {when(member.last_login)}
              </div>
            </div>
            {!member.is_active && (
              <span className="px-2 py-0.5 rounded-full bg-subtle text-ink-muted text-[11px] font-semibold">Deactivated</span>
            )}
            {member.mfa_enrolled ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success-dim text-success text-[11px] font-semibold">
                <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                Two-factor on
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning-dim text-warning text-[11px] font-semibold">
                <ShieldOff className="w-3 h-3" aria-hidden="true" />
                No second factor
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PlatformStaff;

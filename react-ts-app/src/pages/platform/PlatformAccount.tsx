// The staff member's own account, inside the portal. Staff never enter the
// tenant shell, so the two things they must be able to do for themselves
// live here: choose a password and enrol (or turn off) the second factor.
// Reachable without a second-factor session, because it is where the second
// factor is set up.

import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { fetchMe } from '../../features/auth/authSlice';
import { PasswordSection, TwoFactorSection } from '../../components/settings/AccountSecurity';

export function PlatformAccount() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);

  // `mfa_enrolled` is only on /auth/me/; a cached user may predate it.
  useEffect(() => {
    dispatch(fetchMe());
  }, [dispatch]);

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight text-ink">Your account</h1>
        <p className="text-[13px] text-ink-muted mt-1">
          {user?.email} · staff. Two-factor authentication is required for everything else in the portal.
        </p>
      </div>
      <TwoFactorSection enrolled={user?.mfa_enrolled === true} isStaff />
      <PasswordSection />
    </div>
  );
}

export default PlatformAccount;

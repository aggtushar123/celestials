import { Navigate } from 'react-router-dom';
import { useCapability } from '../../hooks';
import type { Capability } from '../../features/auth/authSlice';

// Gates a whole route on one real capability. Always nested inside
// <ProtectedRoute> in App.tsx, so `user` is guaranteed to exist here —
// this only needs to check what they can do, not whether they're
// logged in.
//
// Replaces the old `AdminRoute`, which compared `role === 'admin'`
// back when there were exactly two hardcoded roles. Roles are
// org-defined now, so the route asks for the capability it actually
// needs (Users → `manage_users`) rather than for a role name.
export function RequireCapability({
  capability,
  children,
}: {
  capability: Capability;
  children: React.ReactNode;
}) {
  const allowed = useCapability(capability);

  if (!allowed) {
    return <Navigate to="/work" replace />;
  }

  return <>{children}</>;
}

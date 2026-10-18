import { Navigate } from 'react-router-dom';
import { useAppSelector } from '../../hooks';

/** `/`: sign-in, the staff portal, the first-run tour, or the home page. */
export function RootRedirect() {
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const user = useAppSelector((state) => state.auth.user);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Staff belong to no tenant: the portal is the whole of their app.
  if (user?.is_superuser) return <Navigate to="/platform" replace />;
  // `tour_completed_at` is stamped by the server when the tour is finished
  // or skipped. A user cached from before the field existed has it
  // undefined; they have been here a while, so they are not shown the tour.
  const owesTour = user !== null && user.tour_completed_at === null;
  if (owesTour) return <Navigate to="/onboarding" replace />;
  // Work is the home page (owner, 2026-10-17): the daily brief of what
  // Revenact prepared and what waits on the person is where a day starts.
  // The Copilot and the dashboards are a click away in the sidebar.
  return <Navigate to="/work" replace />;
}

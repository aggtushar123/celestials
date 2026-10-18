import { Navigate, useLocation, useParams } from 'react-router-dom';
import { LEGACY } from './areas';

/** Redirect preserving the query string, so a filtered old link stays filtered. */
export function Keep({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={{ pathname: to, search }} replace />;
}

export function LegacyRedirect() {
  const { '*': rest = '' } = useParams();
  const [tab, sub] = rest.split('/');
  const target = LEGACY[`${tab}/${sub}`] ?? LEGACY[tab] ?? '/dashboard/overview';
  return <Keep to={target} />;
}

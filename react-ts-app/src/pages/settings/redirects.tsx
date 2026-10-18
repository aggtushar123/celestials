import { Navigate, useLocation } from 'react-router-dom';

/** A redirect that keeps the query and the hash: the backend's OAuth
 *  callbacks still send people to /integrations?<result>, and that result
 *  has to arrive at Connections intact. */
export function KeepLocation({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}

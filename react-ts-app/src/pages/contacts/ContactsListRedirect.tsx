import { Navigate, useLocation } from 'react-router-dom';

/** The old /contacts/list lands on /contacts with its filters kept. */
export function ContactsListRedirect() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/contacts', search }} replace />;
}

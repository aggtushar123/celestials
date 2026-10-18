import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ScopeKey } from '../../features/brain/brainTypes';
import { QUIET } from '../ui';

const BACK = `-ml-3 w-fit ${QUIET}`;

/** A Brain sub-page's way back (brain UI spec 2026-10-06 §2): "Customers"
 *  on Feature Requests and Anomalies, "What changed" on the Knowledge graph,
 *  keeping the scope the reader is in. */
export function BrainBackLink({ to, scope, label }: { to: string; scope: ScopeKey | null; label: string }) {
  return (
    <Link to={scope ? `${to}?scope=${scope}` : to} className={BACK}>
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { BundlePanel } from './BundlePanel';
import { openedHere } from './useTaskLink';

/** The one bundle panel on Work (spec §8.2): ?bundle=<id> opens it. Closing
 *  a panel a Review link opened steps back over its entry (Back closes it);
 *  a page loaded with ?bundle= drops only that parameter. Keyed by id. */
export function BundleSheet({ fallbackFocus }: { fallbackFocus: () => HTMLElement | null | undefined }) {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const isSm = useMediaQuery(SM);
  const id = Number(params.get('bundle')) || null;
  if (id === null) return null;
  const close = () => {
    if (openedHere(state)) navigate(-1);
    else
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('bundle');
          return next;
        },
        { replace: true },
      );
  };
  return <BundlePanel key={id} id={id} isSm={isSm} onClose={close} fallbackFocus={fallbackFocus} />;
}

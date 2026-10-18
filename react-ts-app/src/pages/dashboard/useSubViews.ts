import { useOutletContext } from 'react-router-dom';
import type { SubView } from './areas';

export function useSubViews(): SubView[] {
  return useOutletContext<{ subViews?: SubView[] } | undefined>()?.subViews ?? [];
}

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/** How a detail page reads and writes its URL state. Define it once at
 *  module level, so its identity never changes. */
export interface PageParamsCodec<P> {
  parse: (search: URLSearchParams) => P;
  toSearch: (params: P) => URLSearchParams;
  /** Merges a patch into what the URL holds now. */
  withPatch: (params: P, patch: Partial<P>) => P;
}

/** A detail page's URL state. `update` merges a patch into what the URL
 *  holds now and pushes a history entry unless `replace`. Its identity
 *  changes whenever the URL does (react-router's `setSearchParams` does), so
 *  a caller that must not re-run on it reads it through a ref. */
export function usePageParams<P>(codec: PageParamsCodec<P>) {
  const [search, setSearch] = useSearchParams();
  const key = search.toString();
  const params = useMemo(() => codec.parse(new URLSearchParams(key)), [codec, key]);
  const update = useCallback(
    (patch: Partial<P>, options: { replace?: boolean } = {}) => {
      setSearch((prev) => codec.toSearch(codec.withPatch(codec.parse(prev), patch)), { replace: options.replace ?? false });
    },
    [codec, setSearch],
  );
  return { params, update };
}

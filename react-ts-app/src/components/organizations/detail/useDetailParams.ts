import {
  parseDetailParams,
  toDetailSearch,
  withPatch,
  type DetailParams,
} from '../../../features/organizations/detailParams';
import { usePageParams, type PageParamsCodec } from './usePageParams';

const DETAIL_CODEC: PageParamsCodec<DetailParams> = { parse: parseDetailParams, toSearch: toDetailSearch, withPatch };

/** The organization page's URL state (usePageParams). */
export function useDetailParams() {
  return usePageParams(DETAIL_CODEC);
}
